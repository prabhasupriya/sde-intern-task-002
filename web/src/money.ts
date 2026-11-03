// Money is always whole cents. Decimals are only used to show a value, never to calculate.

const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export const formatCents = (cents: number) => formatter.format(cents / 100)

// Turns what a person types ("12", "12.5", "12.50") into whole cents, without any
// floating-point maths. Returns null when it is not a positive amount with up to 2 decimals.
export function parseDollarsToCents(input: string): number | null {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(input.trim())
  if (!match) return null
  const whole = Number(match[1])
  const fraction = Number((match[2] ?? '').padEnd(2, '0'))
  const cents = whole * 100 + fraction
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}

// A fresh id for one payment attempt. randomUUID needs a secure page (https or localhost),
// so there is a fallback for other cases.
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
