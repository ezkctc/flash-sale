import Fastify from 'fastify';
import { app } from './app/app';
import { env } from './lib/env';

const host = env.BEND_HOST;
const port = env.BEND_PORT;

(async () => {
  const server = Fastify({ logger: true });

  await server.register(app);

  server.listen({ port, host }, (err) => {
    if (err) {
      server.log.error(err);
      process.exit(1);
    } else {
      console.log(`[ ready ] http://${host}:${port}`);
    }
  });
})();
