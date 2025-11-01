import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { execution } from 'k6/execution';

// Console color helpers for clearer logs
const COLOR = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  purple: (s) => `\x1b[35m${s}\x1b[0m`, // Added purple for a new log color
};

const API_BASE = __ENV.API_BASE || 'http://api:4000';
const FLASH_SALE_DURATION = Number(__ENV.FLASH_SALE_DURATION || 600);
const STARTING_QUANTITY = Number(__ENV.STARTING_QUANTITY || 100);
const BASE_POLL_S = Number(__ENV.POLLING_INTERVAL || 5);

export const options = {
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
  },
  stages: [
    { duration: '10s', target: 1000 },
    { duration: '120s', target: 1000 },
    // { duration: '100s', target: 1000 },
    { duration: '10s', target: 0 },
  ],
};

// Custom metrics
const buyAttempts = new Counter('fs_buy_attempts');
const buySuccess = new Counter('fs_buy_success');
const buyFailed = new Counter('fs_buy_failed');
const positionChecks = new Counter('fs_position_checks');
const confirmSuccess = new Counter('fs_confirm_success');
const confirmFailed = new Counter('fs_confirm_failed');
const giveUps = new Counter('fs_give_ups');

const tJourney = new Trend('fs_t_journey');
const tBuyToHold = new Trend('fs_t_buy_to_hold');
const tHoldToConfirm = new Trend('fs_t_hold_to_confirm');

const rBuySuccess = new Rate('fs_r_buy_success');
const rConfirmSuccess = new Rate('fs_r_confirm_success');

function now() {
  return Date.now();
}
function iso(d) {
  return new Date(d).toISOString();
}

// CORRECTED: Use explicit checks instead of try/catch to handle the execution context difference.
// execution.vu is only defined in the default function.
function logOnce(msg) {
  let print = true; // If execution.vu is defined (i.e., we are in the 'default' VU function), only let VU #1 print.
  if (execution && execution.vu) {
    print = execution.vu.idInTest === 1;
  } // Otherwise (in setup/teardown), 'print' remains true, so it prints once.
  if (print) console.log(msg);
}

// Helper for logging in the default function, only prints for VU 1 on success
function logSuccess(msg) {
  if (execution && execution.vu && execution.vu.idInTest === 1) {
    console.log(COLOR.purple(msg));
  }
}

const infoOnce = (m) => logOnce(COLOR.cyan(m));
const warnOnce = (m) => logOnce(COLOR.yellow(m));
const okOnce = (m) => logOnce(COLOR.green(m));
const errOnce = (m) => logOnce(COLOR.red(m));

function respSummary(label, res) {
  try {
    const body =
      res && typeof res.body === 'string' ? res.body.slice(0, 300) : '';
    return `${label}: status=${res && res.status} body=${body}`;
  } catch (_) {
    return `${label}: status=${res && res.status}`;
  }
}

function randomEmail(vu, iter) {
  return `buyer-${vu}-${iter}@test.com`;
}

// Helper: fetch sale
function fetchSale(flashSaleId) {
  const url = `${API_BASE}/flash-sales/public/sale?flashSaleId=${flashSaleId}`;
  const res = http.get(url, { tags: { name: 'sale_status' } });
  return { ok: res.status === 200, json: res.json(), status: res.status };
}

// Helper: backoff sleep in seconds
function sleepBackoff(attempt, base = BASE_POLL_S, maxS = 10) {
  const secs = Math.min(maxS, base * Math.pow(1.5, attempt));
  sleep(secs);
}

export function setup() {
  infoOnce(`Using API_BASE=${API_BASE}`);
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(API_BASE)) {
    warnOnce(
      'API_BASE points to localhost. Inside Docker, use http://api:4000'
    );
  }
  const adminEmail = `admin-${now()}@test.com`;
  const adminPassword = 'Password1!'; // 1) Sign-up

  infoOnce(COLOR.bold('→ POST /api/auth/sign-up/email'));
  const suRes = http.post(
    `${API_BASE}/api/auth/sign-up/email`,
    JSON.stringify({
      name: 'admin',
      email: adminEmail,
      password: adminPassword,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'signup' },
    }
  );
  if (!(suRes && (suRes.status === 201 || suRes.status === 200))) {
    errOnce(respSummary('signup failed', suRes));
    throw new Error('setup: signup failed'); // <-- Stops test on failure
  } else {
    okOnce('signup ok');
  }
  check(suRes, {
    'signup 201/200': (r) => r.status === 201 || r.status === 200,
  }); // 2) Sign-in to get bearer token

  infoOnce(COLOR.bold('→ POST /api/auth/sign-in/email'));
  const siRes = http.post(
    `${API_BASE}/api/auth/sign-in/email`,
    JSON.stringify({ email: adminEmail, password: adminPassword }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'signin' },
    }
  );
  if (!(siRes && siRes.status === 200)) {
    errOnce(respSummary('signin failed', siRes));
    throw new Error('setup: signin failed'); // <-- Stops test on failure
  } else {
    okOnce('signin ok');
  }
  check(siRes, { 'signin 200': (r) => r.status === 200 });
  const token = siRes && siRes.status === 200 ? siRes.json('token') : null;
  if (!token) {
    errOnce('signin: token missing in response');
    throw new Error('setup: missing token'); // <-- Stops test on failure
  } // 3) Create flash sale (starts in ~5s)
  const startsAt = new Date(now() + 5000);
  const endsAt = new Date(startsAt.getTime() + FLASH_SALE_DURATION * 1000);
  const body = {
    name: 'K6 Flash Sale',
    description: 'Auto-generated',
    startsAt: iso(startsAt),
    endsAt: iso(endsAt),
    startingQuantity: STARTING_QUANTITY,
    currentQuantity: STARTING_QUANTITY,
    status: 'OnSchedule',
  };
  infoOnce(COLOR.bold('→ POST /flash-sales'));
  const csRes = http.post(`${API_BASE}/flash-sales`, JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    tags: { name: 'sale_create' },
  });
  let saleId;
  if (csRes.status === 201) {
    okOnce('sale create ok');
    check(csRes, { 'sale create 201': (r) => r.status === 201 });
    saleId = csRes.json('id');
  } else if (csRes.status === 409) {
    // Overlap detected — use the existing current/upcoming sale instead
    warnOnce(
      'sale create 409 (overlap). Falling back to existing sale via /flash-sales/public/sale'
    );
    const fallback = http.get(`${API_BASE}/flash-sales/public/sale`, {
      tags: { name: 'sale_fallback' },
    });
    if (fallback.status === 200) {
      const fb = fallback.json();
      saleId = fb?.item?._id || fb?.item?.id;
      if (saleId) {
        okOnce(`using existing sale ${saleId}`);
      } else {
        errOnce(respSummary('fallback sale not found', fallback));
        throw new Error('setup: overlap and no existing sale available'); // <-- Stops test on failure
      }
    } else {
      errOnce(respSummary('fallback sale fetch failed', fallback));
      throw new Error('setup: overlap and failed to fetch existing sale'); // <-- Stops test on failure
    }
  } else {
    errOnce(respSummary('sale create failed', csRes));
    throw new Error('setup: sale create failed'); // <-- Stops test on failure
  }
  if (!saleId) {
    errOnce('setup: sale id missing from response');
    throw new Error('setup: missing saleId'); // <-- Stops test on failure
  } // small buffer so all VUs start after sale begins
  sleep(10);

  return {
    token,
    saleId,
    adminEmail,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  };
}

export default function (data) {
  // K6 automatically prevents default() from running if setup() fails (returns null or throws)
  if (!data || !data.saleId) {
    // This check is technically redundant if setup succeeds, but helpful for debugging
    giveUps.add(1);
    return;
  }

  const { saleId } = data; // Use k6 built-ins to avoid execution.vu undefined edge-cases
  const vu = typeof __VU !== 'undefined' ? __VU : 0;
  const iter = typeof __ITER !== 'undefined' ? __ITER : 0;
  const email = randomEmail(vu, iter); // Guard rails

  const saleRes = fetchSale(saleId);
  if (!saleRes.ok) return;
  const meta = saleRes.json.meta;
  if (
    meta.status === 'ended' ||
    meta.soldOut ||
    (meta.progress && meta.progress.remaining <= 0)
  ) {
    giveUps.add(1);
    return;
  }

  const t0 = now();
  let tHold = null;
  let attempt = 0;
  let maxBuyRetries = 30;

  while (maxBuyRetries-- > 0) {
    buyAttempts.add(1);
    const buyRes = http.post(
      `${API_BASE}/orders/buy`,
      JSON.stringify({ email, flashSaleId: saleId }),
      { headers: { 'Content-Type': 'application/json' }, tags: { name: 'buy' } }
    );

    if (buyRes.status === 200) {
      buySuccess.add(1);
      rBuySuccess.add(true);
      const payload = buyRes.json();
      if (payload.hasActiveHold) {
        tHold = now();
        tBuyToHold.add(tHold - t0);
        logSuccess(
          `[VU ${vu}] 🎯 Hold Secured in ${
            tHold - t0
          }ms for ${email}! Confirming...`
        );

        // go confirm
        const confRes = http.post(
          `${API_BASE}/orders/confirm`,
          JSON.stringify({ email, flashSaleId: saleId, totalAmount: 1 }),
          {
            headers: { 'Content-Type': 'application/json' },
            tags: { name: 'confirm' },
          }
        );
        if (confRes.status === 200) {
          confirmSuccess.add(1);
          rConfirmSuccess.add(true);
          const tHoldConf = now() - (tHold || now());
          const tTotal = now() - t0;
          tHoldToConfirm.add(tHoldConf);
          tJourney.add(tTotal);
          logSuccess(
            `[VU ${vu}] ✅ Purchase Complete! (Hold->Confirm: ${tHoldConf}ms, Total: ${tTotal}ms)`
          );
          return;
        } else {
          confirmFailed.add(1);
          rConfirmSuccess.add(false);
          logSuccess(`[VU ${vu}] ❌ Confirm Failed: Status ${confRes.status}`);
        }
      } else {
        // No hold yet → poll position
        logSuccess(`[VU ${vu}] ⏳ Queue Position Secured. Polling for Hold...`);
      }

      let pollAttempt = 0;
      const maxPollMs = 5 * 60 * 1000; // 5 minutes
      const pollStart = now();

      while (now() - pollStart < maxPollMs) {
        positionChecks.add(1);
        const posRes = http.get(
          `${API_BASE}/orders/position?email=${encodeURIComponent(
            email
          )}&flashSaleId=${encodeURIComponent(saleId)}`,
          { tags: { name: 'position' } }
        );

        if (posRes.status === 200) {
          const p = posRes.json();
          if (p.hasActiveHold) {
            tHold = now();
            tBuyToHold.add(tHold - t0);
            logSuccess(
              `[VU ${vu}] 🎯 Hold Secured via Polling in ${
                tHold - t0
              }ms for ${email}! Confirming...`
            );

            // confirm
            const confRes = http.post(
              `${API_BASE}/orders/confirm`,
              JSON.stringify({ email, flashSaleId: saleId, totalAmount: 1 }),
              {
                headers: { 'Content-Type': 'application/json' },
                tags: { name: 'confirm' },
              }
            );
            if (confRes.status === 200) {
              confirmSuccess.add(1);
              rConfirmSuccess.add(true);
              const tHoldConf = now() - (tHold || now());
              const tTotal = now() - t0;
              tHoldToConfirm.add(tHoldConf);
              tJourney.add(tTotal);
              logSuccess(
                `[VU ${vu}] ✅ Purchase Complete! (Hold->Confirm: ${tHoldConf}ms, Total: ${tTotal}ms)`
              );
              return;
            } else {
              confirmFailed.add(1);
              rConfirmSuccess.add(false);
              logSuccess(
                `[VU ${vu}] ❌ Confirm Failed: Status ${confRes.status}. Retrying Buy...`
              );
              break; // break polling loop and retry buy
            }
          }
        } // backoff

        sleepBackoff(pollAttempt++);
      } // Poll timed out

      buyFailed.add(1);
      rBuySuccess.add(false);
      logSuccess(
        `[VU ${vu}] ⚠️ Polling Timeout. Giving up on current attempt.`
      );
      break; // break buy loop, allow retry
    }

    if (buyRes.status === 409) {
      // already purchased or out-of-stock condition surfaced
      buyFailed.add(1);
      rBuySuccess.add(false);
      logSuccess(
        `[VU ${vu}] 🚫 Buy Failed (409 Conflict): Item sold out or already purchased.`
      );
      break;
    }
    if (buyRes.status >= 500 && buyRes.status <= 504) {
      // server issue → retry with backoff
      buyFailed.add(1);
      rBuySuccess.add(false);
      logSuccess(
        `[VU ${vu}] 🚨 Buy Failed (Status ${buyRes.status}). Retrying...`
      );
      sleepBackoff(attempt++);
      continue;
    } // other client errors → give up this iteration

    buyFailed.add(1);
    rBuySuccess.add(false);
    logSuccess(
      `[VU ${vu}] ❌ Buy Failed (Status ${buyRes.status}). Giving up.`
    );
    break;
  }

  giveUps.add(1);
}

// ---
// Improved Teardown for Human-Readable Summary
// ---
export function teardown(data) {
  // K6 automatically prevents teardown() from running if setup() fails completely.
  const { token, saleId } = data; // Allow pending writes to settle

  sleep(10); // Fetch final sale meta

  const sale = http
    .get(`${API_BASE}/flash-sales/public/sale?flashSaleId=${saleId}`, {
      tags: { name: 'sale_status' },
    })
    .json();
  const finalRemaining = sale?.meta?.progress?.remaining ?? 0; // Count total PAID orders via admin endpoint (paginate)

  let page = 1,
    totalPaid = 0,
    fetched = 0,
    total = 0;
  const limit = 100;
  do {
    const res = http.get(
      `${API_BASE}/orders/admin/list-admin?flashSaleId=${saleId}&page=${page}&limit=${limit}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        tags: { name: 'orders_admin_list' },
      }
    );
    if (res.status !== 200) break;
    const body = res.json();
    total = Number(body.total || 0);
    const items = body.items || [];
    fetched += items.length;
    for (const it of items) {
      if (it.paymentStatus === 'paid') totalPaid += 1;
    }
    page += 1;
  } while (fetched < total);

  const expectedPaid = STARTING_QUANTITY - finalRemaining;
  let summaryStatus;
  let statusColor;

  if (totalPaid > STARTING_QUANTITY) {
    summaryStatus = 'OVERBOOKING DETECTED 😱';
    statusColor = COLOR.red;
  } else if (totalPaid < expectedPaid) {
    summaryStatus = 'UNDERSELLING DETECTED 🤔';
    statusColor = COLOR.yellow;
  } else {
    summaryStatus = 'RESULT: OK ✅';
    statusColor = COLOR.green;
  }

  const finalSummary = `
${COLOR.bold('--- 🛍️ K6 FLASH SALE TEST SUMMARY 🛍️ ---')}
  **Sale ID:** ${saleId}
  **Starting Quantity:** ${COLOR.bold(STARTING_QUANTITY)}
  **Final Remaining:** ${COLOR.bold(finalRemaining)}
  **Expected Paid Orders (Max):** ${COLOR.bold(expectedPaid)}
  **Actual Total PAID Orders:** ${COLOR.bold(totalPaid)}

  **TEST STATUS:** ${statusColor(COLOR.bold(summaryStatus))}
${COLOR.bold('-------------------------------------')}
`;

  console.log(finalSummary);
}
