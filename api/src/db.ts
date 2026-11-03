// Row shapes as they come out of SQLite, and the JSON shapes we send to clients.

export type ShareRow = {
  id: string
  member_id: string
  amount_cents: number
  paid_at: string | null
  idempotency_key: string | null
}

export type Share = {
  id: string
  memberId: string
  amountCents: number
  paidAt: string | null
}

export const toShare = (row: ShareRow): Share => ({
  id: row.id,
  memberId: row.member_id,
  amountCents: row.amount_cents,
  paidAt: row.paid_at,
})

export async function homeExists(db: D1Database, homeId: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS found FROM homes WHERE id = ?1').bind(homeId).first()
  return row !== null
}

// The one statement that decides who pays a share. `AND paid_at IS NULL` means only the first
// update can match the row; every later one changes 0 rows. Shared with the tests on purpose.
export const PAY_SHARE_SQL = `UPDATE shares SET paid_at = ?3, idempotency_key = ?4
     WHERE id = ?1 AND bill_id = ?2 AND paid_at IS NULL`
