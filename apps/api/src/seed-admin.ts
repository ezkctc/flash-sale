import 'dotenv/config';

const BEND_HOST = process.env.BEND_HOST ?? 'localhost';
const BEND_PORT = process.env.BEND_PORT ? Number(process.env.BEND_PORT) : 4000;
const BASE = `http://${BEND_HOST}:${BEND_PORT}`;

async function main() {
  const email = 'admin@email.com';
  const password = 'admin';

  const res = await fetch(`${BASE}/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Make origin check happy
      origin: BASE,
    } as any,
    body: JSON.stringify({ email, password, name: 'Admin' }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Seed admin failed:', res.status, text);
    process.exit(1);
  }

  console.log('Seed admin user created:', email);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
