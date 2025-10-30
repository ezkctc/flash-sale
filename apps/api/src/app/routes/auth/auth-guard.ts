import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { extractBearerToken } from '../../../utils/extract-bearer';

export const authGuard =
  (app: FastifyInstance) =>
  async (req: FastifyRequest, reply: FastifyReply) => {
    const token = extractBearerToken(req.headers.authorization as any);
    if (!token) {
      reply.header(
        'WWW-Authenticate',
        'Bearer realm="api", error="invalid_token", error_description="Missing bearer token"'
      );
      return reply.code(401).send({ message: 'Unauthorized' });
    }

    const db = app.mongo.db;
    const session = await db.collection('sessions').findOne({ token });
    if (!session) {
      reply.header(
        'WWW-Authenticate',
        'Bearer realm="api", error="invalid_token", error_description="Unknown token"'
      );
      return reply.code(401).send({ message: 'Unauthorized' });
    }

    const expiresAt =
      session.expiresAt instanceof Date
        ? session.expiresAt
        : new Date(session.expiresAt);

    if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
      try {
        await db
          .collection('sessions')
          .deleteOne({ _id: (session as any)._id });
      } catch {}
      reply.header(
        'WWW-Authenticate',
        'Bearer realm="api", error="invalid_token", error_description="Token expired"'
      );
      return reply.code(401).send({ message: 'Unauthorized' });
    }

    (req as any).session = session;
    (req as any).userId = session.userId;
  };
