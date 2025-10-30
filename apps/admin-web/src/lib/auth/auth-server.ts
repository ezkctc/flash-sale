import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';

export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  plugins: [nextCookies()],
});
