import { z } from 'zod'

// We check every answer from the API before the page uses it, so an unexpected
// answer becomes a clear error message instead of a crash while rendering.

export const homeSchema = z.object({ id: z.string(), name: z.string() })
export const homesResponseSchema = z.object({ homes: z.array(homeSchema) })

export const memberSchema = z.object({ id: z.string(), homeId: z.string(), name: z.string() })

export const shareSchema = z.object({
  id: z.string(),
  memberId: z.string(),
  amountCents: z.number().int(),
  paidAt: z.string().nullable(),
})

export const billSchema = z.object({
  id: z.string(),
  homeId: z.string(),
  title: z.string(),
  totalCents: z.number().int(),
  shares: z.array(shareSchema),
})
export const billsResponseSchema = z.object({ bills: z.array(billSchema) })

export const balanceSchema = z.object({
  memberId: z.string(),
  name: z.string(),
  outstandingCents: z.number().int(),
})
export const balancesResponseSchema = z.object({ balances: z.array(balanceSchema) })

export type Home = z.infer<typeof homeSchema>
export type Share = z.infer<typeof shareSchema>
export type Bill = z.infer<typeof billSchema>
export type Balance = z.infer<typeof balanceSchema>
