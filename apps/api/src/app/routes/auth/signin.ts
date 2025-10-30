import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';

type SignInBody = {
  email: string;
  password: string;
  rememberMe?: boolean;
  callbackURL?: string;
};

export default async function (fastify: FastifyInstance) {
  fastify.post<{ Body: SignInBody }>(
    '/sign-in/email', // <-- put it under /auth for consistency with the client
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
        const headers = fromNodeHeaders({
          ...request.headers,
          'x-forwarded-host':
            (request.headers['x-forwarded-host'] as string) ??
            request.headers.host ??
            '',
          'x-forwarded-proto':
            (request.headers['x-forwarded-proto'] as string) ??
            // @ts-ignore fastify types
            request.protocol ??
            'http',
        });

        const result: any = await fastify.auth.api.signInEmail({
          body: request.body,
          headers,
        });

        const payload = result?.body ?? result;
        if (!payload?.token || !payload?.user) {
          fastify.log.error({ payload: result }, 'No token/user from signInEmail');
          return reply.code(401).send({ message: 'Invalid credentials' });
        }

        // Persist bearer token session
        const now = new Date();
        const ttlHours = request.body.rememberMe ? 24 * 30 : 24;
        const expiresAt = new Date(now.getTime() + ttlHours * 3600 * 1000);
        await fastify.mongo.db.collection('sessions').updateOne(
          { token: payload.token },
          {
            $set: {
              token: payload.token,
              userId: payload.user.id,
              email: payload.user.email,
              name: payload.user.name,
              createdAt: now,
              expiresAt,
            },
          },
          { upsert: true }
        );

        reply.header('Cache-Control', 'no-store');
        return reply.code(200).send({ token: payload.token, user: payload.user });
      } catch (error) {
        request.log.error(error);
        return reply.status(401).send({ message: 'Failed to sign in' });
      }
    }
  );
}
