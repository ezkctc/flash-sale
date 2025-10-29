import { FastifyInstance } from 'fastify';

import signup from './signup';
import signin from './signin';
import signout from './signout';

export const authRoutes = async (app: FastifyInstance) => {
  // Add all routes here
  signup(app);
  signin(app);
  signout(app);
};

export default authRoutes;
