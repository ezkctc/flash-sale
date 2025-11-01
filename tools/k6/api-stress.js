import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // ramp to 20
    { duration: '1m', target: 50 },    // ramp to 50
    { duration: '2m', target: 200 },   // ramp to 200
    { duration: '3m', target: 500 },   // spike to 500
    { duration: '1m', target: 500 },   // sustain peak
    { duration: '1m', target: 200 },   // scale down
    { duration: '30s', target: 0 },    // ramp to zero
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],        // <2% errors under stress
    http_req_duration: ['p(95)<750', 'p(99)<1500'],
  },
};

const BASE = __ENV.API_BASE || 'http://api:4300';

export default function () {
  const res = http.get(`${BASE}/health`);
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  sleep(0.5);
}

