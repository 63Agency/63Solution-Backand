/** Sérialise un payload pour les logs (tronqué si très long). */
export function stringifyForLog(value: unknown, maxLen = 12000): string {
  try {
    const raw = JSON.stringify(value, null, 2);
    if (raw.length <= maxLen) return raw;
    return `${raw.slice(0, maxLen)}\n… [truncated ${raw.length - maxLen} chars]`;
  } catch {
    return String(value);
  }
}

export function formatSupabaseError(error: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
} | null): string {
  if (!error) return 'unknown';
  return JSON.stringify({
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}
