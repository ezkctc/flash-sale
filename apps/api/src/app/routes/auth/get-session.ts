import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { extractBearerToken } from '../../../utils/extract-bearer';

type SessionDoc = {
  _id: any;
  token: string;
  userId: string;
  email?: string;
  name?: string;
  createdAt: Date | string;
  expiresAt: Date | string;
};

export default async function (app: FastifyInstance) {
  app.get(
    '/get-session',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Get current session (Bearer token)',
        response: {
          200: {
            type: 'object',
            properties: {
              session: {
                type: 'object',
                properties: {
                  userId: { type: 'string' },
                  expiresAt: { type: 'string' }, // ISO string
                },
                required: ['userId', 'expiresAt'],
              },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string', nullable: true },
                  name: { type: 'string', nullable: true },
                },
                required: ['id'],
              },
            },
            required: ['session', 'user'],
          },
          401: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
        },
      },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        // 1) Extract Bearer token
        const token = extractBearerToken(
          (req.headers.authorization as string) ||
            (req.headers as any).Authorization
        );

        if (!token) {
          reply.header(
            'WWW-Authenticate',
            'Bearer realm="api", error="invalid_token", error_description="Missing bearer token"'
          );
          return reply.code(401).send({ message: 'Unauthorized' });
        }

        // 2) Get DB handle
        const db = app.mongo?.db;
        if (!db) {
          req.log.error('Mongo DB handle missing on app.mongo.db');
          return reply.code(500).send({ message: 'Server DB not initialized' });
        }

        // 3) Lookup session
        const sessions = db.collection<SessionDoc>('sessions');
        const session = await sessions.findOne({ token });
        if (!session) {
          reply.header(
            'WWW-Authenticate',
            'Bearer realm="api", error="invalid_token", error_description="Unknown token"'
          );
          return reply.code(401).send({ message: 'Unauthorized' });
        }

        // 4) Expiry check
        const expiresAt =
          session.expiresAt instanceof Date
            ? session.expiresAt
            : new Date(session.expiresAt);

        if (
          !expiresAt ||
          Number.isNaN(expiresAt.getTime()) ||
          expiresAt < new Date()
        ) {
          // Optional cleanup
          try {
            await sessions.deleteOne({ _id: (session as any)._id });
          } catch {}
          reply.header(
            'WWW-Authenticate',
            'Bearer realm="api", error="invalid_token", error_description="Token expired"'
          );
          return reply.code(401).send({ message: 'Unauthorized' });
        }

        // 5) Success
        reply.header('Cache-Control', 'no-store');
        return reply.code(200).send({
          session: {
            userId: String(session.userId),
            expiresAt: expiresAt.toISOString(),
          },
          user: {
            id: String(session.userId),
            email: session.email,
            name: session.name,
          },
        });
      } catch (err) {
        req.log.error(err);
        return reply.code(401).send({ message: 'Failed to get session' });
      }
    }
  );
}
