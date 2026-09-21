/** Origines CORS partagées HTTP + WebSocket (socket.io). */
export const CORS_ORIGINS = [
  'https://app.63agency.com',
  'http://localhost:3000',
  'http://localhost:3001',
] as const;

export type CorsOrigin = (typeof CORS_ORIGINS)[number];

export function isCorsOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  return (CORS_ORIGINS as readonly string[]).includes(origin);
}
