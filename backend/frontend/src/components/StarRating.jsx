/**
 * readOnly=true just renders filled/empty stars at the given value (for
 * showing an average or a submitted rating). readOnly=false (default) is
 * clickable, calling onChange(n) — used by the "rate this hangout" widget.
 */
export default function StarRating({ value = 0, onChange, readOnly = false, size = 18 }) {
  const stars = [1, 2, 3, 4, 5]
  return (
    <div style={{ display: 'inline-flex', gap: 3 }}>
      {stars.map((n) => (
        <span
          key={n}
          onClick={readOnly ? undefined : () => onChange(n)}
          style={{
            fontSize: size,
            color: n <= Math.round(value) ? 'var(--lime)' : 'var(--surface-3)',
            cursor: readOnly ? 'default' : 'pointer',
            lineHeight: 1,
          }}
        >
          ★
        </span>
      ))}
    </div>
  )
}
