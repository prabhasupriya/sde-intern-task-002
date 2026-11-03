# SDE Intern Assignment: Shared Bill Splitter

Welcome. In this assignment you build a small bill splitter for a shared home. It has two parts:

1. **Homes and members:** create a home and add members to it.
2. **Bill splitting:** split a bill between the members. Each member pays their own share.

The assignment is small on purpose. We want correct, safe, and clear code. We do not want many features.

## What we look at

- **Your code passes the tests.** The tests decide, not opinion. You get the visible tests. We also run extra tests that you do not see.
- **Your code is safe when things go wrong.** Wrong input, repeated requests, and two requests at the same time must not break your data.
- **Your code is typed.** Use TypeScript. Do not use `any`.
- **You understand your code.** You record a short video and explain it.

Take your time. A careful, correct solution is better than a fast one. We expect 2 to 3 days of real work.

## Stack (required)

- **API:** Hono on Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite). The binding is `DB` in `api/wrangler.jsonc`.
- **Web:** React, Vite, TanStack Router
- **Language:** TypeScript on both sides
- **Tests:** Vitest, running inside the Workers runtime
- **Quality:** Biome. `pnpm check` and `pnpm typecheck` must pass.

You choose the rest (styling, form library, validation library). Pick tools you can explain.

## The task

The assignment has two parts. Do Part 1 first. Part 2 builds on it.

**Database.** Write the schema as SQL migration files in `api/migrations/`. For example `0001_init.sql`. The tests apply every file in this folder. Your schema must have **at least 3 named constraints** that protect the data. For example a foreign key, a `CHECK`, or a `UNIQUE` key. Be ready to explain what each constraint stops.

**Errors.** Every error response is JSON: `{ "error": "message" }`.

## Part 1: Homes and members

Create a home and add members to it. The order in which members are added matters in Part 2.

#### `POST /api/homes`

- Request: `{ "name": string }`
- Success: `201` `{ id, name }`

#### `POST /api/homes/:homeId/members`

- Request: `{ "name": string }`
- Success: `201` `{ id, homeId, name }`
- Errors: `404` home not found

Visible tests: `api/test/homes.test.ts`.

## Part 2: Bill splitting

Add a bill to a home, split it between the members, and let each member pay their share.

All amounts are whole **cents** (integers). `100` cents is 1 dollar. Never use decimals for money.

#### `POST /api/homes/:homeId/bills`

- Request: `{ "title": string, "totalCents": number }`
- Success: `201` `{ id, homeId, title, totalCents, shares: [{ id, memberId, amountCents, paidAt: null }] }`
- Errors: `404` home not found. `422` total is not a positive whole number, or the home has no members.

#### `POST /api/bills/:billId/shares/:shareId/pay`

- Request: header `Idempotency-Key`
- Success: `200` `{ id, memberId, amountCents, paidAt }`
- Errors: `400` key missing. `404` bill or share not found. `409` share already paid with a different key.

#### `GET /api/homes/:homeId/balances`

- Success: `200` `{ balances: [{ memberId, name, outstandingCents }] }`
- Errors: `404` home not found

**Rules**

- **Split.** A bill is split between all members of the home. The shares always add up to `totalCents`. If the amount does not divide evenly, the extra cents go to the members one by one, in the order the members were added to the home. Example: 1000 cents between 3 members gives `334`, `333`, `333`.
- **Pay.** Paying marks one share as paid and sets `paidAt`. If the same `Idempotency-Key` is sent again for the same share, answer `200` with the same result. Do not pay twice. If two requests pay the same share at the same time, only one may succeed.
- **Balances.** `outstandingCents` is the sum of the member's unpaid shares, across all bills of the home. List the members in the order they were added.

Visible tests: `api/test/bills.test.ts` and `api/test/payments.test.ts`.

#### Web page

Build one page that:

- shows the bills of a home and the shares of each bill,
- lets a member pay a share,
- shows clear **loading**, **empty**, and **error** states,
- keeps the share unpaid and shows an error if the payment fails.

The page must not crash when the API answers with an error or is slow.

## Cases you must handle

You must handle these cases and talk about them in your video:

1. A home with no members.
2. An amount that is zero, negative, or not a whole number.
3. An amount that does not divide evenly.
4. The same payment request sent twice.
5. Two members paying the same share at the same time.
6. A bill or share that does not exist.
7. The API answers with a 500 error or is slow. The web page must not crash.

## Run it

This is a pnpm workspace. Install once at the root.

```bash
pnpm install
pnpm dev          # api on :8787 and web on :5173
```

Open http://localhost:5173. The starter page shows a title. `/api/health` returns `{ "status": "ok" }`.

```bash
pnpm test         # run the visible tests in api/test
pnpm check        # Biome: format and lint. Must pass.
pnpm check:fix    # fix what Biome can fix
pnpm typecheck    # tsc on both packages. Must pass.
pnpm build        # production build of the web app
```

`pnpm dev` applies your migrations to a local database before it starts the API.

If pnpm says some build scripts were ignored, run `pnpm approve-builds` and allow `esbuild` and `workerd`.

When you change `api/wrangler.jsonc`, refresh the `Env` types:

```bash
pnpm --filter bill-splitter-api cf-typegen
```

## Rules for the tests

- The visible tests are in `api/test`. They start with a failing result. Your job is to make them pass.
- Do **not** change the visible tests or `api/test/helpers.ts`. We compare them with the original.
- We run extra tests after you submit. They test the cases in "Cases you must handle" more closely.

## AI policy

You can use AI tools. Tell us which ones and where in your answers on the form.
You must understand every line you submit. We check this with your video and in a live call. "The AI wrote it" is not an answer.

## How to submit

1. Click **Use this template**, then **Create a new repository**. Make the repository **public**.
2. Build your solution in your new repository. Small, clear commits are welcome.
3. Update this README with a short section called **Decisions**. Write 3 decisions you made and why.
4. Record a video of **3 minutes or less** (Loom or unlisted YouTube). Show the architecture, the data flow, and one trade-off you made. Make sure anyone with the link can view it.
5. Paste the repository link and the video link in the application form.

We will run `pnpm install && pnpm check && pnpm typecheck && pnpm test` on your repository.

---

# My solution

## Decisions

**1. The database decides who wins, not my code.**
Paying is one conditional statement: `UPDATE shares SET paid_at = ?, idempotency_key = ? WHERE id = ? AND bill_id = ? AND paid_at IS NULL`.
If two requests pay the same share at once, SQLite runs the updates one after the other, so the first changes 1 row and the second changes 0 rows.
I check the number of changed rows and answer `200` (same key, or I won) or `409` (a different key already paid it).
I did not use "read the row, then write it" in TypeScript, because two requests can both read "unpaid" before either writes.
D1 has no interactive transactions, so a single guarded statement (or `db.batch`) is the safe tool here.
The same idea is used when adding a member (`INSERT ... WHERE EXISTS (home)`), so "check" and "insert" cannot be separated.

**2. A bill and its shares are saved together, and the split is calculated in SQL.**
`POST /bills` runs one `db.batch` (D1 runs a batch as one transaction): insert the bill (only if the home has members), then insert one share per member.
The split is `total / n` for everyone, plus one extra cent for the first `total % n` members, counted with `ROW_NUMBER() OVER (ORDER BY seq)`.
Doing this inside the same transaction means a member added at the same moment cannot make the shares disagree with the members, and the shares always add up to `totalCents`.
Trade-off: the SQL is harder to read than a loop in TypeScript, so I explained it in comments and tested many totals and member counts.

**3. Money is whole cents, and the rules are enforced twice.**
The API validates with zod (a positive whole number, so `0`, `-100`, `10.5`, `"1000"` and `null` get `422`).
The database repeats the important rules as named constraints, so a bug or a future endpoint cannot store bad data:

| Constraint                                                               | What it stops                                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `members_home_fk`, `bills_home_fk`, `shares_bill_fk`, `shares_member_fk` | rows pointing at a home, bill or member that does not exist        |
| `bills_total_positive_integer`                                           | a zero, negative or non-integer bill total                         |
| `shares_amount_non_negative_integer`                                     | a negative or non-integer share                                    |
| `shares_one_per_member_per_bill`                                         | two shares of one bill for the same member                         |
| `shares_paid_has_key`                                                    | a half-paid row (`paid_at` and the key are both set or both empty) |
| `*_name_not_blank`, `bills_title_not_blank`                              | empty or whitespace-only names and titles                          |

"The order members were added" is stored as an `AUTOINCREMENT` column (`seq`), because it only goes up and has no ties (timestamps can tie).

## How each required case is handled

1. **Home with no members:** `422`, and no bill is saved.
2. **Zero, negative or non-whole amount:** `422` from zod, and the database `CHECK` would stop it too.
3. **Amount that does not divide evenly:** extra cents go to the first members in the order added (1000 cents / 3 = 334, 333, 333).
4. **Same payment sent twice:** the same `Idempotency-Key` returns `200` with the same `paidAt`, and the share is paid once.
5. **Two members paying the same share at once:** only one update changes a row. The other gets `409`.
6. **Bill or share that does not exist:** `404`. A share that belongs to another bill is also `404`.
7. **API answers 500 or is slow:** requests time out after 10 seconds. Every error becomes a readable message. The share stays unpaid, and the page keeps working. A retry reuses the same key, so a timeout can never cause a double payment.

Every error from the API is JSON: `{ "error": "message" }` (including unknown routes and unexpected `500`s).

## Extra endpoints I added

The assignment lists no way to read bills or homes, but the web page needs them:

- `GET /api/homes` lists homes (newest first, at most 100)
- `GET /api/homes/:homeId/bills` lists bills with their shares (newest first, at most 50)

## Tests

- The visible tests in `api/test` are unchanged.
- `api/test/edge-cases.test.ts` is mine. It covers invalid input, odd splits, repeated and simultaneous payments, balances and the list endpoint.
- The local test runtime cannot force two requests to interleave, so one test checks the guarded `UPDATE` directly: of 4 updates for one share, exactly 1 changes a row. I checked that this test fails if `AND paid_at IS NULL` is removed.

## Limits (on purpose, to keep it small)

- No login. Anyone can pay any share.
- Bills are not paginated beyond the latest 50, and there is no way to delete or edit anything.
- An idempotency key belongs to one share. It is not a general key store.

## AI tools

I used Claude (Anthropic) to help write the first version of the code and the tests.
