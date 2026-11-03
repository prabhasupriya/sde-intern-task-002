import { Hono } from 'hono'
import { homeExists, PAY_SHARE_SQL, type Share, type ShareRow, toShare } from '../db'
import { ApiError, notFound } from '../errors'
import { createBillSchema, parseBody, readIdempotencyKey } from '../validation'

export const bills = new Hono<{ Bindings: Env }>()

type BillRow = { id: string; home_id: string; title: string; total_cents: number }
type Bill = { id: string; homeId: string; title: string; totalCents: number; shares: Share[] }

const toBill = (row: BillRow, shares: Share[]): Bill => ({
  id: row.id,
  homeId: row.home_id,
  title: row.title,
  totalCents: row.total_cents,
  shares,
})

const SHARE_COLUMNS = 'id, member_id, amount_cents, paid_at, idempotency_key'
const MAX_BILLS = 50

// Create a bill and split it between every member of the home.
bills.post('/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')
  const { title, totalCents } = await parseBody(c, createBillSchema)
  const billId = crypto.randomUUID()

  // Both statements run in ONE batch, which D1 runs as a single transaction:
  // either the bill and all of its shares are saved, or nothing is.
  //
  // 1. Insert the bill, but only if the home has at least one member.
  // 2. Insert one share per member. The split is done in SQL, in the same transaction, so
  //    a member added at the same moment cannot make the shares disagree with the members.
  //    base = total / n (whole cents), and the first (total % n) members get one extra cent,
  //    counting members in the order they were added (ROW_NUMBER over seq).
  const [insertBill] = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO bills (id, home_id, title, total_cents)
       SELECT ?1, ?2, ?3, CAST(?4 AS INTEGER)
       WHERE EXISTS (SELECT 1 FROM members WHERE home_id = ?2)`,
    ).bind(billId, homeId, title, totalCents),
    c.env.DB.prepare(
      `INSERT INTO shares (id, bill_id, member_id, amount_cents)
       SELECT lower(hex(randomblob(16))),
              ?1,
              id,
              CAST(?3 AS INTEGER) / n + CASE WHEN rn <= CAST(?3 AS INTEGER) % n THEN 1 ELSE 0 END
       FROM (
         SELECT id,
                ROW_NUMBER() OVER (ORDER BY seq) AS rn,
                COUNT(*) OVER () AS n
         FROM members
         WHERE home_id = ?2
       )
       WHERE EXISTS (SELECT 1 FROM bills WHERE id = ?1)`,
    ).bind(billId, homeId, totalCents),
  ])

  if (!insertBill || insertBill.meta.changes === 0) {
    // Nothing was inserted: either the home is missing (404) or it has no members (422).
    if (!(await homeExists(c.env.DB, homeId))) throw notFound('home')
    throw new ApiError(422, 'home has no members')
  }

  const { results } = await c.env.DB.prepare(
    `SELECT ${SHARE_COLUMNS} FROM shares WHERE bill_id = ?1 ORDER BY seq`,
  )
    .bind(billId)
    .all<ShareRow>()

  const bill: Bill = { id: billId, homeId, title, totalCents, shares: results.map(toShare) }
  return c.json(bill, 201)
})

// Not required by the assignment, but the web page needs it to show bills and shares.
bills.get('/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')
  if (!(await homeExists(c.env.DB, homeId))) throw notFound('home')

  const [billResult, shareResult] = await c.env.DB.batch<BillRow | ShareRowWithBill>([
    c.env.DB.prepare(
      `SELECT id, home_id, title, total_cents FROM bills
       WHERE home_id = ?1 ORDER BY seq DESC LIMIT ?2`,
    ).bind(homeId, MAX_BILLS),
    c.env.DB.prepare(
      `SELECT bill_id, ${SHARE_COLUMNS} FROM shares
       WHERE bill_id IN (SELECT id FROM bills WHERE home_id = ?1 ORDER BY seq DESC LIMIT ?2)
       ORDER BY seq`,
    ).bind(homeId, MAX_BILLS),
  ])

  const sharesByBill = new Map<string, Share[]>()
  for (const row of (shareResult?.results ?? []) as ShareRowWithBill[]) {
    const list = sharesByBill.get(row.bill_id) ?? []
    list.push(toShare(row))
    sharesByBill.set(row.bill_id, list)
  }

  const list = ((billResult?.results ?? []) as BillRow[]).map((row) =>
    toBill(row, sharesByBill.get(row.id) ?? []),
  )
  return c.json({ bills: list })
})

type ShareRowWithBill = ShareRow & { bill_id: string }

// Pay one share. Safe to repeat (idempotent) and safe against two requests at once.
bills.post('/bills/:billId/shares/:shareId/pay', async (c) => {
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')
  const key = readIdempotencyKey(c)

  const find = () =>
    c.env.DB.prepare(`SELECT ${SHARE_COLUMNS} FROM shares WHERE id = ?1 AND bill_id = ?2`)
      .bind(shareId, billId)
      .first<ShareRow>()

  // The same key means "the same request again", so answer with what we already stored.
  // A different key means someone else already paid this share, which is a conflict.
  const answerForPaid = (row: ShareRow) => {
    if (row.idempotency_key === key) return c.json(toShare(row), 200)
    throw new ApiError(409, 'share is already paid')
  }

  const share = await find()
  if (!share) throw notFound('share')
  if (share.paid_at !== null) return answerForPaid(share)

  // The important line. `AND paid_at IS NULL` makes the database decide who wins:
  // if two requests get here together, SQLite runs the updates one after the other,
  // so the first changes 1 row and the second changes 0 rows.
  const result = await c.env.DB.prepare(PAY_SHARE_SQL)
    .bind(shareId, billId, new Date().toISOString(), key)
    .run()

  // Read the row again so we answer with what is really stored, whoever won.
  const latest = await find()
  if (!latest) throw notFound('share')
  if (result.meta.changes === 1) return c.json(toShare(latest), 200)
  return answerForPaid(latest)
})
