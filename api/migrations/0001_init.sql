-- Schema for the shared bill splitter.
-- All money is stored as whole cents (INTEGER). Never REAL.
--
-- Each table has an INTEGER `seq` primary key (AUTOINCREMENT) and a public TEXT `id` (UUID).
-- `seq` only ever goes up, so ORDER BY seq always gives "the order they were added".
-- That is how we give the extra cents to members "in the order they were added".

CREATE TABLE homes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  CONSTRAINT homes_id_unique UNIQUE (id),
  -- Stops empty or whitespace-only names that slipped past the API.
  CONSTRAINT homes_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE members (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  home_id TEXT NOT NULL,
  name TEXT NOT NULL,
  CONSTRAINT members_id_unique UNIQUE (id),
  -- Stops a member from pointing at a home that does not exist.
  CONSTRAINT members_home_fk FOREIGN KEY (home_id) REFERENCES homes (id),
  CONSTRAINT members_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE INDEX members_home_order_idx ON members (home_id, seq);

CREATE TABLE bills (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  home_id TEXT NOT NULL,
  title TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  CONSTRAINT bills_id_unique UNIQUE (id),
  CONSTRAINT bills_home_fk FOREIGN KEY (home_id) REFERENCES homes (id),
  -- Stops zero, negative and non-integer totals (typeof stops 10.5 and '1000').
  CONSTRAINT bills_total_positive_integer CHECK (typeof(total_cents) = 'integer' AND total_cents > 0),
  CONSTRAINT bills_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE INDEX bills_home_order_idx ON bills (home_id, seq);

CREATE TABLE shares (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  bill_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  -- NULL while unpaid. Set exactly once, by the pay endpoint.
  paid_at TEXT,
  -- The Idempotency-Key of the request that paid this share.
  idempotency_key TEXT,
  CONSTRAINT shares_id_unique UNIQUE (id),
  CONSTRAINT shares_bill_fk FOREIGN KEY (bill_id) REFERENCES bills (id),
  CONSTRAINT shares_member_fk FOREIGN KEY (member_id) REFERENCES members (id),
  -- Stops the same member from getting two shares of the same bill.
  CONSTRAINT shares_one_per_member_per_bill UNIQUE (bill_id, member_id),
  -- Stops negative or non-integer share amounts.
  CONSTRAINT shares_amount_non_negative_integer CHECK (typeof(amount_cents) = 'integer' AND amount_cents >= 0),
  -- Stops a half-paid row: paid_at and the key are either both set or both empty.
  CONSTRAINT shares_paid_has_key CHECK ((paid_at IS NULL) = (idempotency_key IS NULL))
);

CREATE INDEX shares_bill_idx ON shares (bill_id, seq);
CREATE INDEX shares_member_idx ON shares (member_id);
