import 'dotenv/config';
import { ExecutorContext } from '@nx/devkit';
import { execSync } from 'child_process';
import * as path from 'path';

export interface K6RunExecutorOptions {
  script: string;
  options?: string;
}

export default async function k6RunExecutor(
  options: K6RunExecutorOptions,
  context: ExecutorContext
) {
  // Use the root of the entire Nx workspace
  const workspaceRoot = context.root;

  // Resolve the absolute path to the k6 script file
  const absoluteScriptPath = path.join(workspaceRoot, options.script);

  // We mount the entire workspace root into the k6 container at /src
  // The path inside the container will be relative to /src
  const containerScriptPath = `/src/${options.script}`;

  // Build optional env passthroughs for scenario variables
  const passthroughEnv = [
    'API_BASE',
    'FLASH_SALE_DURATION',
    'STARTING_QUANTITY',
    'POLLING_INTERVAL',
  ]
    .filter((k) => process.env[k] !== undefined)
    .map((k) => `-e ${k}=${process.env[k]}`)
    .join(' ');

  if (
    process.env.API_BASE &&
    /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(process.env.API_BASE)
  ) {
    console.warn(
      `Warning: API_BASE is set to ${process.env.API_BASE}. When k6 runs inside Docker, localhost points to the k6 container. Use http://api:4000 for Compose.`
    );
  }

  // 1. K6 command inside Docker
  // -e K6_PROMETHEUS_... configures k6 to output results to Prometheus
  const command = `docker run --rm --network flash-sale_default \
  -e K6_OUT=experimental-prometheus-rw \
  -e K6_PROMETHEUS_RW_SERVER_URL=http://prometheus:9090/api/v1/write \
  -e K6_PROMETHEUS_RW_TREND_STATS=min,med,avg,max \
  ${passthroughEnv} \
  -v "${workspaceRoot}:/src" grafana/k6 run "${containerScriptPath}" ${
    options.options || ''
  }`;

  console.log(`\n> Executing K6 load test: ${command}\n`);

  try {
    execSync(command, { stdio: 'inherit' });
    return { success: true };
  } catch (e: any) {
    console.error(`\nK6 run failed: ${e.message}\n`);
    return { success: false };
  }
}
