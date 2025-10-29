import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

type SignUpBody = {
  name: string;
  email: string;
  password: string;
  image?: string;
  callbackURL?: string;
};

export default async function (fastify: FastifyInstance) {
  fastify.post<{ Body: SignUpBody }>(
    '/sign-up/email',
    {
      schema: {
        tags: ['Auth'],
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 6 },
            callbackURL: { type: 'string', nullable: true },
          },
        },
      },
    },
    async function (
      request: FastifyRequest<{ Body: SignUpBody }>,
      reply: FastifyReply
    ) {
      try {
        const result = await fastify.auth.api.signUpEmail({
          body: request.body,
        });

        // result: { token: string | null, user: {...} }
        reply.code(201).send(result);
      } catch (error) {
        request.log.error(error);
        reply.status(500).send({ message: 'Failed to sign up' });
      }
    }
  );
}
