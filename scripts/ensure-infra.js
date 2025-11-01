// scripts/ensure-infra.js
const { execSync } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

function which(cmd) {
  try {
    execSync(process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`);
    return true;
  } catch {
    return false;
  }
}
const composeCmd = which('docker')
  ? 'docker compose'
  : which('docker-compose')
  ? 'docker-compose'
  : null;
if (!composeCmd) {
  console.error('[err] Neither `docker` nor `docker-compose` found in PATH');
  process.exit(1);
}

// ensure we execute in the folder that has docker-compose.yml
const repoRootCandidates = [
  process.cwd(),
  path.resolve(__dirname, '..'),
  path.resolve(__dirname, '..', '..'),
];
const composeCwd = repoRootCandidates.find((p) =>
  fs.existsSync(path.join(p, 'docker-compose.yml'))
);
if (!composeCwd) {
  console.error(
    '[err] Cannot find docker-compose.yml from',
    repoRootCandidates
  );
  process.exit(1);
}
process.chdir(composeCwd);

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] })
    .toString()
    .trim();
}

function isContainerRunning(name) {
  try {
    const out = sh(
      `docker ps --filter "name=^/${name}$" --format "{{.Names}}"`
    );
    return out.split('\n').some((n) => n.trim() === name);
  } catch {
    return false;
  }
}

function isPortOpen(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (val) => {
      if (!done) {
        done = true;
        try {
          socket.destroy();
        } catch {
          //do nothing
        }
        resolve(val);
      }
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function waitForHealthyOrPort({
  containerName,
  host,
  port,
  maxWaitMs = 60000,
}) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const status = sh(
        `docker inspect -f "{{.State.Health.Status}}" ${containerName}`
      );
      if (status === 'healthy') return true;
    } catch {
      /* no healthcheck */
    }
    if (await isPortOpen(host, port, 1000)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function ensureService({ service, containerName, host, port }) {
  if (isContainerRunning(containerName)) {
    console.log(
      `[ok] ${containerName} already running, waiting for readiness...`
    );
    const ready = await waitForHealthyOrPort({ containerName, host, port });
    if (!ready) {
      console.error(`[err] ${containerName} did not become ready in time`);
      process.exitCode = 1;
    } else {
      console.log(`[ok] ${containerName} is ready`);
    }
    return;
  }

  if (await isPortOpen(host, port)) {
    console.log(
      `[ok] Port ${host}:${port} in use. Assuming external ${service}.`
    );
    return;
  }

  console.log(`[start] ${composeCmd} up -d ${service}`);
  try {
    sh(`${composeCmd} up -d ${service}`);
    const ready = await waitForHealthyOrPort({ containerName, host, port });
    if (!ready) {
      console.error(`[err] ${service} started but not ready. Recent logs:`);
      try {
        console.error(sh(`docker logs --tail=100 ${containerName}`));
      } catch {
        //do nothing
      }
      process.exitCode = 1;
    } else {
      console.log(`[ok] ${service} is ready`);
    }
  } catch (e) {
    console.error(`[err] Failed to start ${service}:`, e?.message || e);
    process.exitCode = 1;
  }
}

(async () => {
  // --- Database/Cache Services ---
  await ensureService({
    service: 'redis',
    containerName: 'flash-sale-redis',
    host: '127.0.0.1',
    port: 6379,
  });

  await ensureService({
    service: 'mongo',
    containerName: 'flash-sale-mongo',
    host: '127.0.0.1',
    port: 27017,
  });

  // --- Monitoring Services  ---
  await ensureService({
    service: 'prometheus',
    containerName: 'flash-sale-prometheus',
    host: '127.0.0.1',
    port: 9090, // Prometheus Web UI Port
  });

  await ensureService({
    service: 'grafana',
    containerName: 'flash-sale-grafana',
    host: '127.0.0.1',
    port: 3000, // Grafana Web UI Port
  });
})();
