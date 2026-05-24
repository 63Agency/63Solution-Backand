import type { ValidationError } from 'class-validator';

export function flattenValidationErrors(
  errors: ValidationError[],
  prefix = '',
): string[] {
  const out: string[] = [];
  for (const err of errors) {
    const path = prefix ? `${prefix}.${err.property}` : err.property;
    if (err.constraints) {
      for (const msg of Object.values(err.constraints)) {
        out.push(path ? `${path}: ${msg}` : String(msg));
      }
    }
    if (err.children?.length) {
      out.push(...flattenValidationErrors(err.children, path));
    }
  }
  return out;
}
