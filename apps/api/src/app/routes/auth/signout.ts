import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { extractBearerToken } from '../../../utils/extract-bearer';

export default async function (fastify: FastifyInstance) {
  fastify.post(
    '/sign-out',
    {
      schema: {
        tags: ['Auth'],
      },
    },
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        const token = extractBearerToken(request.headers.authorization as any);
        if (token) {
          try {
            await fastify.mongo.db.collection('sessions').deleteOne({ token });
          } catch (e) {
            request.log.error(e, 'Failed to delete token session');
          }
        }
        reply.code(200).send({ ok: true });
      } catch (error) {
        request.log.error(error);
        reply.status(401).send({ message: 'Failed to sign out' });
      }
    }
  );
}
