import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { PAY_SHARE_SQL } from '../src/db'
import { type Balance, call, createBill, createHome, type Share } from './helpers'

// Extra tests written by the candidate for the cases listed in the README.
// The provided visible tests and helpers are not changed.

function pay(billId: string, shareId: string, key: string) {
  return call<Share & { error?: string }>('POST', `/api/bills/${billId}/shares/${shareId}/pay`, {
    headers: { 'Idempotency-Key': key },
  })
}

async function setup(memberNames = ['Asha', 'Ben'], totalCents = 1000) {
  const { homeId, members } = await createHome(memberNames)
  const bill = await createBill(homeId, totalCents)
  const first = bill.body.shares[0]
  if (!first) throw new Error('bill has no shares')
  return { homeId, members, bill: bill.body, first }
}

describe('errors are always JSON', () => {
  it('answers an unknown route with a JSON error', async () => {
    const response = await call<{ error: string }>('GET', '/api/nope')
    expect(response.status).toBe(404)
    expect(response.body.error).toEqual(expect.any(String))
  })

  it('answers a missing home with a JSON error', async () => {
    const response = await call<{ error: string }>('GET', '/api/homes/missing/balances')
    expect(response.status).toBe(404)
    expect(response.body.error).toEqual(expect.any(String))
  })
})

describe('invalid input', () => {
  it.each([
    ['a missing name', {}],
    ['an empty name', { name: '' }],
    ['a blank name', { name: '   ' }],
    ['a number as name', { name: 5 }],
    ['a name that is too long', { name: 'x'.repeat(101) }],
  ])('rejects a home with %s', async (_label, body) => {
    const response = await call<{ error: string }>('POST', '/api/homes', { body })
    expect(response.status).toBe(422)
    expect(response.body.error).toEqual(expect.any(String))
  })

  it('rejects a member with a blank name', async () => {
    const { homeId } = await createHome([])
    const response = await call('POST', `/api/homes/${homeId}/members`, { body: { name: ' ' } })
    expect(response.status).toBe(422)
  })

  it('rejects a body that is not JSON', async () => {
    const response = await call<{ error: string }>('POST', '/api/homes', { body: undefined })
    expect(response.status).toBe(422)
    expect(response.body.error).toEqual(expect.any(String))
  })

  it.each([
    ['a missing total', { title: 'Rent' }],
    ['a missing title', { totalCents: 100 }],
    ['a blank title', { title: '  ', totalCents: 100 }],
    ['NaN-like text', { title: 'Rent', totalCents: 'abc' }],
    ['a huge unsafe number', { title: 'Rent', totalCents: 1e30 }],
    ['an array', { title: 'Rent', totalCents: [100] }],
  ])('rejects a bill with %s', async (_label, body) => {
    const { homeId } = await createHome(['Asha'])
    const response = await call('POST', `/api/homes/${homeId}/bills`, { body })
    expect(response.status).toBe(422)
  })

  it('does not save a bill that was rejected', async () => {
    const { homeId } = await createHome(['Asha'])
    await call('POST', `/api/homes/${homeId}/bills`, { body: { title: 'Rent', totalCents: 0 } })
    const list = await call<{ bills: unknown[] }>('GET', `/api/homes/${homeId}/bills`)
    expect(list.body.bills).toEqual([])
  })

  it('does not save a bill for a home with no members', async () => {
    const { homeId } = await createHome([])
    await createBill(homeId, 1000)
    const list = await call<{ bills: unknown[] }>('GET', `/api/homes/${homeId}/bills`)
    expect(list.body.bills).toEqual([])
  })

  it('treats SQL in a name as plain text', async () => {
    const evil = "Robert'); DROP TABLE homes;--"
    const created = await call<{ id: string; name: string }>('POST', '/api/homes', {
      body: { name: evil },
    })
    expect(created.status).toBe(201)
    expect(created.body.name).toBe(evil)
    const again = await call('POST', '/api/homes', { body: { name: 'Still works' } })
    expect(again.status).toBe(201)
  })
})

describe('splitting', () => {
  it.each([
    [1, 1, [1]],
    [1, 3, [1, 0, 0]],
    [2, 3, [1, 1, 0]],
    [7, 3, [3, 2, 2]],
    [10, 4, [3, 3, 2, 2]],
    [1000, 3, [334, 333, 333]],
  ])('splits %i cents between %i members as %j', async (totalCents, count, expected) => {
    const { homeId } = await createHome(['A', 'B', 'C', 'D'].slice(0, count))
    const bill = await createBill(homeId, totalCents)
    expect(bill.status).toBe(201)
    expect(bill.body.shares.map((share) => share.amountCents)).toEqual(expected)
  })

  it('keeps shares equal to the total for many members and awkward totals', async () => {
    const names = Array.from({ length: 11 }, (_, index) => `Member ${index}`)
    const { homeId } = await createHome(names)
    for (const total of [1, 10, 99, 100, 1234567, 9_007_199_254_740_991]) {
      const bill = await createBill(homeId, total)
      expect(bill.status).toBe(201)
      const sum = bill.body.shares.reduce((acc, share) => acc + share.amountCents, 0)
      expect(sum).toBe(total)
      const amounts = bill.body.shares.map((share) => share.amountCents)
      expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1)
    }
  })

  it('creates two bills at the same time without mixing shares', async () => {
    const { homeId } = await createHome(['Asha', 'Ben', 'Chitra'])
    const [a, b] = await Promise.all([createBill(homeId, 1000), createBill(homeId, 2000)])
    expect(a.body.shares).toHaveLength(3)
    expect(b.body.shares).toHaveLength(3)
    expect(a.body.shares.reduce((acc, share) => acc + share.amountCents, 0)).toBe(1000)
    expect(b.body.shares.reduce((acc, share) => acc + share.amountCents, 0)).toBe(2000)
  })
})

describe('paying', () => {
  it('rejects an empty Idempotency-Key header', async () => {
    const { bill, first } = await setup()
    const response = await pay(bill.id, first.id, '   ')
    expect(response.status).toBe(400)
  })

  it('answers the same request sent many times with the same result', async () => {
    const { homeId, bill, first } = await setup()
    const key = crypto.randomUUID()
    const answers = await Promise.all(Array.from({ length: 5 }, () => pay(bill.id, first.id, key)))
    for (const answer of answers) {
      expect(answer.status).toBe(200)
      expect(answer.body.paidAt).toBe(answers[0]?.body.paidAt)
    }
    const balances = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(balances.body.balances.map((balance) => balance.outstandingCents)).toEqual([0, 500])
  })

  it('lets only one of two different payers win when they pay at the same time', async () => {
    const { homeId, bill, first } = await setup()
    const keys = Array.from({ length: 6 }, () => crypto.randomUUID())
    const answers = await Promise.all(keys.map((key) => pay(bill.id, first.id, key)))

    const statuses = answers.map((answer) => answer.status).sort()
    expect(statuses.filter((status) => status === 200)).toHaveLength(1)
    expect(statuses.filter((status) => status === 409)).toHaveLength(keys.length - 1)

    const balances = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(balances.body.balances.map((balance) => balance.outstandingCents)).toEqual([0, 500])
  })

  it('keeps the first result after a later request with another key is rejected', async () => {
    const { bill, first } = await setup()
    const winnerKey = crypto.randomUUID()
    const winner = await pay(bill.id, first.id, winnerKey)
    const loser = await pay(bill.id, first.id, crypto.randomUUID())
    const retry = await pay(bill.id, first.id, winnerKey)

    expect(loser.status).toBe(409)
    expect(loser.body.error).toEqual(expect.any(String))
    expect(retry.status).toBe(200)
    expect(retry.body.paidAt).toBe(winner.body.paidAt)
  })

  it('returns 404 when the share belongs to another bill', async () => {
    const { homeId, first } = await setup()
    const other = await createBill(homeId, 500)
    const response = await pay(other.body.id, first.id, crypto.randomUUID())
    expect(response.status).toBe(404)
  })
})

describe('the database decides who pays', () => {
  // The route tests above cannot force two requests to interleave inside the local test
  // runtime, so this test checks the guard itself: of many updates for one share, exactly one
  // may change a row. Without `AND paid_at IS NULL` every update would change 1 row.
  it('lets exactly one update change a share, however many are sent', async () => {
    const { bill, first } = await setup()
    const update = (key: string) =>
      env.DB.prepare(PAY_SHARE_SQL).bind(first.id, bill.id, new Date().toISOString(), key).run()

    const results = await Promise.all(['a', 'b', 'c', 'd'].map(update))

    expect(results.map((result) => result.meta.changes).sort()).toEqual([0, 0, 0, 1])
  })
})

describe('balances', () => {
  it('shows every member, even a member with no bills yet', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])
    const balances = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(balances.body.balances.map((balance) => balance.outstandingCents)).toEqual([0, 0])
  })

  it('returns an empty list for a home with no members', async () => {
    const { homeId } = await createHome([])
    const balances = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(balances.status).toBe(200)
    expect(balances.body.balances).toEqual([])
  })

  it('does not mix balances between two homes', async () => {
    const first = await setup(['Asha', 'Ben'], 1000)
    await setup(['Chitra', 'Dev'], 4000)
    const balances = await call<{ balances: Balance[] }>(
      'GET',
      `/api/homes/${first.homeId}/balances`,
    )
    expect(balances.body.balances.map((balance) => balance.name)).toEqual(['Asha', 'Ben'])
    expect(balances.body.balances.map((balance) => balance.outstandingCents)).toEqual([500, 500])
  })
})

describe('listing bills (used by the web page)', () => {
  it('lists bills newest first, each with its shares', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])
    await createBill(homeId, 100)
    const second = await createBill(homeId, 200)

    const list = await call<{ bills: { id: string; shares: Share[] }[] }>(
      'GET',
      `/api/homes/${homeId}/bills`,
    )
    expect(list.status).toBe(200)
    expect(list.body.bills[0]?.id).toBe(second.body.id)
    expect(list.body.bills).toHaveLength(2)
    expect(list.body.bills.every((bill) => bill.shares.length === 2)).toBe(true)
  })

  it('returns 404 for a missing home', async () => {
    const list = await call('GET', '/api/homes/missing/bills')
    expect(list.status).toBe(404)
  })
})
