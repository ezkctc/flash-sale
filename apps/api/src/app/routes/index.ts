import { FastifyInstance } from 'fastify';

import healthRoute from './health';

import ordersRoutes from './orders';
import flashSalesRoutes from './flash-sales';
import authRoutes from './auth';

export const integrateRoutes = (app: FastifyInstance) => {
  // Register existing routes
  app.register((instance, _opts, next) => {
    instance.register(healthRoute, { prefix: 'health' });
    instance.register(authRoutes, { prefix: 'api/auth' });
    instance.register(flashSalesRoutes, { prefix: 'flash-sales' });
    instance.register(ordersRoutes, { prefix: 'orders' });
    next();
  });
};
