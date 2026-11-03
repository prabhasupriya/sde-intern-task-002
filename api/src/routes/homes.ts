import { Hono } from 'hono'
import { homeExists } from '../db'
import { notFound } from '../errors'
import { createHomeSchema, createMemberSchema, parseBody } from '../validation'

export const homes = new Hono<{ Bindings: Env }>()

const MAX_LIST = 100

// Not required by the assignment, but the web page needs a way to pick a home.
homes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name FROM homes ORDER BY seq DESC LIMIT ?1',
  )
    .bind(MAX_LIST)
    .all<{ id: string; name: string }>()
  return c.json({ homes: results })
})

homes.post('/', async (c) => {
  const { name } = await parseBody(c, createHomeSchema)
  const id = crypto.randomUUID()
  await c.env.DB.prepare('INSERT INTO homes (id, name) VALUES (?1, ?2)').bind(id, name).run()
  return c.json({ id, name }, 201)
})

homes.post('/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')
  const { name } = await parseBody(c, createMemberSchema)
  const id = crypto.randomUUID()

  // One statement checks that the home exists and inserts, so there is no gap between
  // "check" and "insert" for another request to slip into.
  const result = await c.env.DB.prepare(
    `INSERT INTO members (id, home_id, name)
     SELECT ?1, ?2, ?3
     WHERE EXISTS (SELECT 1 FROM homes WHERE id = ?2)`,
  )
    .bind(id, homeId, name)
    .run()

  if (result.meta.changes === 0) throw notFound('home')
  return c.json({ id, homeId, name }, 201)
})

homes.get('/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')
  if (!(await homeExists(c.env.DB, homeId))) throw notFound('home')

  // LEFT JOIN keeps members who have no shares yet (they owe 0).
  // The CASE only adds up shares that are still unpaid.
  const { results } = await c.env.DB.prepare(
    `SELECT m.id AS memberId,
            m.name AS name,
            COALESCE(SUM(CASE WHEN s.paid_at IS NULL THEN s.amount_cents END), 0) AS outstandingCents
     FROM members m
     LEFT JOIN shares s ON s.member_id = m.id
     WHERE m.home_id = ?1
     GROUP BY m.id
     ORDER BY m.seq`,
  )
    .bind(homeId)
    .all<{ memberId: string; name: string; outstandingCents: number }>()

  return c.json({ balances: results })
})
