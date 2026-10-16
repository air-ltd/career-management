/**
 * Read a field off a loose record as display text.
 *
 * Records arrive from Dexie as `unknown`-valued, so every read needs a check
 * rather than a cast: `String(value)` on an object yields "[object Object]", and
 * a CV that renders "[object Object]" where an employer should be reading a
 * company name is worse than one that renders nothing.
 *
 * Shared by the two consumers rather than duplicated, so both agree on what a
 * missing field looks like — which is `''`, not `"undefined"`.
 */
export function text(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return String(value)
  return ''
}
