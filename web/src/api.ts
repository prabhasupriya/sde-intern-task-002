import type { z } from 'zod'
import {
  balancesResponseSchema,
  billSchema,
  billsResponseSchema,
  homeSchema,
  homesResponseSchema,
  memberSchema,
  shareSchema,
} from './schemas'

// An error with a message that is safe to show to the person using the page.
export class ApiClientError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

const TIMEOUT_MS = 10_000

type Options = {
  method?: 'GET' | 'POST'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

function readErrorField(text: string): string | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
      return typeof parsed.error === 'string' ? parsed.error : null
    }
  } catch {
    // The answer was not JSON (for example an HTML error page). Handled by the caller.
  }
  return null
}

// One place for every request. It never throws anything except an Error with a readable
// message, and it gives up after TIMEOUT_MS so a slow API cannot freeze the page.
async function request<Schema extends z.ZodType>(
  schema: Schema,
  path: string,
  options: Options = {},
): Promise<z.output<Schema>> {
  const signals = [AbortSignal.timeout(TIMEOUT_MS)]
  if (options.signal) signals.push(options.signal)

  let status: number
  let ok: boolean
  let text: string
  try {
    const response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...options.headers },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.any(signals),
    })
    status = response.status
    ok = response.ok
    text = await response.text()
  } catch (error) {
    // The caller cancelled on purpose (for example the page closed): pass it through quietly.
    if (options.signal?.aborted) throw error
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiClientError('The server took too long to answer. Please try again.')
    }
    throw new ApiClientError('Cannot reach the server. Check your connection and try again.')
  }

  if (!ok) {
    const fromServer = readErrorField(text)
    if (status >= 500) {
      throw new ApiClientError(
        `The server had a problem (error ${status}). Please try again.`,
        status,
      )
    }
    throw new ApiClientError(fromServer ?? `The request failed (error ${status}).`, status)
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new ApiClientError('The server sent an answer we could not read.', status)
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    throw new ApiClientError('The server sent an unexpected answer.', status)
  }
  return parsed.data
}

export const listHomes = (signal: AbortSignal) =>
  request(homesResponseSchema, '/api/homes', { signal }).then((result) => result.homes)

export const createHome = (name: string) =>
  request(homeSchema, '/api/homes', { method: 'POST', body: { name } })

export const addMember = (homeId: string, name: string) =>
  request(memberSchema, `/api/homes/${encodeURIComponent(homeId)}/members`, {
    method: 'POST',
    body: { name },
  })

export const listBills = (homeId: string, signal: AbortSignal) =>
  request(billsResponseSchema, `/api/homes/${encodeURIComponent(homeId)}/bills`, { signal }).then(
    (result) => result.bills,
  )

export const createBill = (homeId: string, title: string, totalCents: number) =>
  request(billSchema, `/api/homes/${encodeURIComponent(homeId)}/bills`, {
    method: 'POST',
    body: { title, totalCents },
  })

export const getBalances = (homeId: string, signal: AbortSignal) =>
  request(balancesResponseSchema, `/api/homes/${encodeURIComponent(homeId)}/balances`, {
    signal,
  }).then((result) => result.balances)

export const payShare = (billId: string, shareId: string, idempotencyKey: string) =>
  request(
    shareSchema,
    `/api/bills/${encodeURIComponent(billId)}/shares/${encodeURIComponent(shareId)}/pay`,
    { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } },
  )
