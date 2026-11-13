/** Money is stored as KES cents everywhere; this is the one place it becomes text. */
export function formatKes(cents) {
  if (cents == null) return ''
  return `KES ${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}
