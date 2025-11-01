import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'], // <1% errors
    http_req_duration: ['p(95)<500'], // p95 < 500ms
  },
};

const BASE = __ENV.API_BASE || 'http://api:4000';

export default function () {
  const res = http.get(`${BASE}/health`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'body has ok': (r) => r.json('status') === 'ok',
  });
  sleep(1);
}
