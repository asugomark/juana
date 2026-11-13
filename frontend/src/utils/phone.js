/** Kenyan mobile number -> 2547XXXXXXXX / 2541XXXXXXXX (what SasaPay wants), or null.
 *  Accepts how people actually type it: 0712 345 678, +254 712 345 678, 712345678.
 *  Mirrors backend/app/utils/phone.py — the server re-checks, this just saves a round trip. */
export function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length === 10) digits = '254' + digits.slice(1)
  else if (digits.length === 9 && '71'.includes(digits[0])) digits = '254' + digits
  return /^254[17]\d{8}$/.test(digits) ? digits : null
}
