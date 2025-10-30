import type { FastifyInstance } from 'fastify';

import listRoute from './list';
import getByIdRoute from './get-by-id';
import createRoute from './create';
import updateRoute from './update';
import deleteRoute from './delete';
import publicSaleRoute from './public-sale';

export const flashSalesRoutes = async (app: FastifyInstance) => {
  listRoute(app);
  getByIdRoute(app);
  createRoute(app);
  updateRoute(app);
  deleteRoute(app);
  publicSaleRoute(app);
};

export default flashSalesRoutes;
