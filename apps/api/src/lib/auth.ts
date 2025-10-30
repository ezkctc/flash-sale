import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import type { Db } from 'mongodb';

type CreateAuthOpts = {
  db: Db;
  apiOrigin: string;
  clientOrigins: string[];
  secureCookies?: boolean;
};

export function createAuth({
  db,
  apiOrigin,
  clientOrigins,
  secureCookies = false,
}: CreateAuthOpts) {
  return betterAuth({
    database: mongodbAdapter(db),

    emailAndPassword: { enabled: true, requireEmailVerification: false },

    trustedOrigins: [apiOrigin, ...clientOrigins],

    session: {
      expiresIn: 30 * 24 * 60 * 60,
      cookie: {
        name: 'ba_session',
        sameSite: 'lax',
        secure: secureCookies,
        httpOnly: true,
        path: '/',
      },
    },
  });
}

export type AuthInstance = ReturnType<typeof betterAuth>;
