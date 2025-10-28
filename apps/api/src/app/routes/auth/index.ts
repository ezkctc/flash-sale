import type { FastifyInstance } from 'fastify';
import { toNodeHandler } from 'better-auth/node';

export default async function authRoutes(app: FastifyInstance) {
  const handler = toNodeHandler(app.auth);

  // Exclude HEAD: Fastify auto-exposes HEAD for GET routes by default (exposeHeadRoutes)
  const methods = ['GET','POST','PUT','DELETE','PATCH','OPTIONS'] as const;
  for (const method of methods) {
    app.route({
      method: method as any,
      url: '/auth/*',
      handler: async (req, reply) => {
        reply.hijack();
        await handler(req.raw, reply.raw);
      },
    });
  }
}
