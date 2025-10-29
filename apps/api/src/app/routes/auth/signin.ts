import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

type SignInBody = {
  email: string;
  password: string;
  rememberMe?: boolean;
  callbackURL?: string;
};

export default async function (fastify: FastifyInstance) {
  fastify.post<{ Body: SignInBody }>(
    '/sign-in/email',
    {
      schema: {
        tags: ['Auth'],
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 6 },
            rememberMe: { type: 'boolean', default: false },
            callbackURL: { type: 'string', nullable: true },
          },
        },
      },
    },
    async function (
      request: FastifyRequest<{ Body: SignInBody }>,
      reply: FastifyReply
    ) {
      try {
        // Forward essential headers so cookies/origin are respected
        const headers = {
          cookie: request.headers.cookie ?? '',
          origin: (request.headers.origin ??
            request.headers.referer ??
            '') as string,
          'user-agent': (request.headers['user-agent'] ?? '') as string,
        };

        const result: any = await fastify.auth.api.signInEmail({
          body: request.body,
          headers,
        });

        // If the API method returns response headers (e.g., Set-Cookie), mirror them
        if (result?.headers)
          reply.headers(result.headers as Record<string, any>);

        // result.body if present (some versions) else result directly
        reply.code(200).send(result?.body ?? result);
      } catch (error) {
        request.log.error(error);
        reply.status(401).send({ message: 'Failed to sign in' });
      }
    }
  );
}
