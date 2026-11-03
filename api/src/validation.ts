import type { Context } from 'hono'
import { z } from 'zod'
import { ApiError } from './errors'

const name = z.string().trim().min(1, 'name is required').max(100, 'name is too long')

export const createHomeSchema = z.object({ name })
export const createMemberSchema = z.object({ name })
export const createBillSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(200, 'title is too long'),
  // `.int()` rejects 10.5, strings and null. `.positive()` rejects 0 and negatives.
  // In zod 4, `.int()` also rejects numbers that are not safe integers.
  totalCents: z
    .number('totalCents must be a number')
    .int('totalCents must be a whole number')
    .positive('totalCents must be positive'),
})

// A body that is missing, not JSON, or the wrong shape all end up as one clear 422.
export async function parseBody<Schema extends z.ZodType>(
  c: Context,
  schema: Schema,
): Promise<z.output<Schema>> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new ApiError(422, 'request body must be valid JSON')
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = issue?.path.join('.')
    throw new ApiError(
      422,
      field ? `${field}: ${issue?.message}` : (issue?.message ?? 'invalid body'),
    )
  }
  return result.data
}

const MAX_KEY_LENGTH = 255

// The pay endpoint needs a non-empty Idempotency-Key header.
export function readIdempotencyKey(c: Context): string {
  const key = c.req.header('Idempotency-Key')?.trim()
  if (!key) throw new ApiError(400, 'Idempotency-Key header is required')
  if (key.length > MAX_KEY_LENGTH) throw new ApiError(400, 'Idempotency-Key header is too long')
  return key
}
