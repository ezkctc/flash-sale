import Fastify from 'fastify';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { collectDefaultMetrics } from 'prom-client';
import metrics from 'fastify-metrics'; // For general server metrics

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const QUEUE_NAME = process.env.QUEUE_NAME || 'sale-processing-queue';
const WORKER_METRICS_PORT = 4001; // Separate port for the worker metrics

export async function startMetricsServer() {
  const fastify = Fastify({ logger: true });

  // 1. Connect to Redis (must use the same connection as the worker)
  const redisConnection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  // 2. Initialize the Queue instance to retrieve metrics
  const flashSaleQueue = new Queue(QUEUE_NAME, {
    connection: redisConnection,
  });

  // --- Prometheus/Node.js Metrics ---
  collectDefaultMetrics({ prefix: 'flash_sale_worker_' });

  // Register the fastify-metrics plugin for general server metrics
  // Use a non-conflicting endpoint so we can expose our own combined '/metrics'
  await fastify.register(metrics, { endpoint: '/node-metrics' });

  // --- BullMQ Metrics Endpoint ---
  // This route is responsible for fetching the BullMQ metrics
  // and combining them with the Node.js process metrics.
  fastify.get('/metrics', async (request, reply) => {
    // 1. Get default Node/Fastify metrics (handled by fastify-metrics)
    const defaultMetrics = await fastify.metrics.client.register.metrics();

    // 2. Get BullMQ-specific metrics
    // BullMQ provides metrics for queue state (waiting, active, failed jobs)
    const bullMetrics = await flashSaleQueue.exportPrometheusMetrics();

    // 3. Combine and send the response
    reply
      .code(200)
      .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(`${defaultMetrics}\n${bullMetrics}`);
  });

  try {
    const address = await fastify.listen({
      port: WORKER_METRICS_PORT,
      host: '0.0.0.0', // Listen on all interfaces
    });
    console.log(`[Metrics] Server listening on ${address}/metrics`);
  } catch (err) {
    fastify.log.error(err);
    // Note: It's important not to exit the process, as the main worker is still running
  }
}
