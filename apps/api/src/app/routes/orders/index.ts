import type { FastifyInstance } from 'fastify';

// sibling routes
import adminListRoute from './admin-list';
import adminQueueMembersRoute from './admin-queue-members';
import adminQueueOverviewRoute from './admin-queue-overview';
import adminQueueStreamRoute from './admin-queue-stream';
import buyRoute from './buy';
import byEmailRoute from './by-email';
import confirmRoute from './confirm';
import positionRoute from './position';

export const ordersRoutes = async (app: FastifyInstance) => {
  // Public/user routes
  buyRoute(app);
  confirmRoute(app);
  byEmailRoute(app);
  positionRoute(app);

  // Admin routes
  adminListRoute(app);
  adminQueueMembersRoute(app);
  adminQueueOverviewRoute(app);
  adminQueueStreamRoute(app);
};

export default ordersRoutes;
