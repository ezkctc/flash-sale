import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  vus: Number(__ENV.SOAK_VUS || 25),
  duration: __ENV.SOAK_DURATION || '15m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<600'],
  },
};

const BASE = __ENV.API_BASE || 'http://api:4300';

export default function () {
  const res = http.get(`${BASE}/health`);
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  sleep(1);
}

