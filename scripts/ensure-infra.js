// scripts/ensure-infra.js
const { execSync } = require('child_process');
const net = require('net');

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

function isPortOpen(host, port, timeoutMs = 600) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (val) => {
      if (!done) {
        done = true;
        try {
          socket.destroy();
        } catch {
          //dont do anything
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

async function ensureService({ service, containerName, host, port }) {
  // 1) If our named container is already running, reuse it.
  if (isContainerRunning(containerName)) {
    console.log(`[ok] ${containerName} already running, reusing it.`);
    return;
  }

  // 2) If port is already in use, assume an external instance and skip.
  if (await isPortOpen(host, port)) {
    console.log(
      `[ok] Port ${host}:${port} is already in use. Assuming external ${service}. Skipping start.`
    );
    return;
  }

  // 3) Otherwise, bring up just this service.
  console.log(`[start] docker compose up -d ${service}`);
  try {
    sh(`docker compose up -d ${service}`);
    console.log(`[ok] ${service} started`);
  } catch (e) {
    console.error(`[err] Failed to start ${service}:`, e?.message || e);
    process.exitCode = 1;
  }
}

(async () => {
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
})();
