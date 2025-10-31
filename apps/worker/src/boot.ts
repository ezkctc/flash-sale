import { startWorker } from './main';

startWorker().catch((e) => {
  console.error('[worker boot error]', e);
  process.exit(1);
});
