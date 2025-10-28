import 'dotenv/config';

const HOST = process.env.HOST ?? 'localhost';
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const BASE = `http://${HOST}:${PORT}`;

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
    body: JSON.stringify({ email, password }),
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

