import type { FastifyInstance } from 'fastify';

export const authGuard =
  (app: FastifyInstance) => async (req: any, reply: any) => {
    const res =
      (await app.auth.api
        .getSession({ headers: { cookie: req.headers?.cookie ?? '' } })
        .catch(() => null)) || null;

    if (!res?.session) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }

    // optional: stash for downstream handlers
    req.auth = res; // { session, user }
  };
