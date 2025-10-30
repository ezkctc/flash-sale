import { auth } from '../../../../lib/auth/auth-server';

export async function GET(request: Request) {
  return auth.handler(request);
}

export async function POST(request: Request) {
  return auth.handler(request);
}

// Optional: support other methods Better Auth uses (DELETE, PATCH)
export async function DELETE(request: Request) {
  return auth.handler(request);
}

export async function PATCH(request: Request) {
  return auth.handler(request);
}
