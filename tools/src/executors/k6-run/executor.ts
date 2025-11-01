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

  // 1. K6 command inside Docker
  // -e K6_PROMETHEUS_... configures k6 to output results to Prometheus
  const command = `docker run --rm --network flash-sale_default \
  -e K6_OUT=experimental-prometheus-rw \
  -e K6_PROMETHEUS_RW_SERVER_URL=http://prometheus:9090/api/v1/write \
  -e K6_PROMETHEUS_RW_TREND_STATS=min,med,avg,max \
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
