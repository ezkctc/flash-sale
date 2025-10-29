import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

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
        const headers = {
          cookie: request.headers.cookie ?? '',
          origin: (request.headers.origin ??
            request.headers.referer ??
            '') as string,
          'user-agent': (request.headers['user-agent'] ?? '') as string,
        };

        const result: any = await fastify.auth.api.signOut({ headers });

        if (result?.headers)
          reply.headers(result.headers as Record<string, any>);
        reply.code(200).send(result?.body ?? result);
      } catch (error) {
        request.log.error(error);
        reply.status(401).send({ message: 'Failed to sign out' });
      }
    }
  );
}
