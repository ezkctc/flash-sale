import type { FastifyInstance } from 'fastify';

import listRoute from './list';
import getByIdRoute from './get-by-id';
import createRoute from './create';
import updateRoute from './update';
import deleteRoute from './delete';
import publicNextRoute from './public-next';

export const flashSalesRoutes = async (app: FastifyInstance) => {
  listRoute(app);
  getByIdRoute(app);
  createRoute(app);
  updateRoute(app);
  deleteRoute(app);
  publicNextRoute(app);
};

export default flashSalesRoutes;
