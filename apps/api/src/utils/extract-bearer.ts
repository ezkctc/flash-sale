export function extractBearerToken(authHeader?: string | string[]): string | null {
  if (!authHeader) return null;
  const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;

  let s = raw.trim();
  while (/^bearer\s+/i.test(s)) s = s.replace(/^bearer\s+/i, '');
  s = s.trim();

  if (!s || /^bearer\b/i.test(s)) return null;
  return s;
}

