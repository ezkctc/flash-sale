import { FastifyInstance } from 'fastify';

import signup from './signup';
import signin from './signin';
import signout from './signout';
import getsession from './get-session';

export const authRoutes = async (app: FastifyInstance) => {
  // Add all routes here
  signup(app);
  signin(app);
  signout(app);
  getsession(app);
};

export default authRoutes;
