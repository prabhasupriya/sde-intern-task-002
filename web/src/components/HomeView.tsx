import { useCallback } from 'react'
import { addMember, createBill, getBalances, listBills } from '../api'
import { formatCents } from '../money'
import { useLoad } from '../useLoad'
import { BillList } from './BillList'
import { BillForm, NameForm } from './Forms'

type Props = { homeId: string }

// Everything for one home. The parent gives it `key={homeId}`, so choosing another home
// starts this component fresh (loading state, no old data).
export function HomeView({ homeId }: Props) {
  const load = useCallback(
    (signal: AbortSignal) =>
      Promise.all([listBills(homeId, signal), getBalances(homeId, signal)]).then(
        ([bills, balances]) => ({ bills, balances }),
      ),
    [homeId],
  )
  const { state, reload } = useLoad(load)

  if (state.status === 'loading') return <p role="status">Loading…</p>

  if (state.status === 'error') {
    return (
      <div className="card">
        <p className="error" role="alert">
          {state.message}
        </p>
        <button type="button" onClick={reload}>
          Try again
        </button>
      </div>
    )
  }

  const { bills, balances } = state.data
  const memberNames = new Map(balances.map((balance) => [balance.memberId, balance.name]))

  return (
    <>
      {state.refreshError && (
        <p className="error" role="alert">
          Could not refresh: {state.refreshError}{' '}
          <button type="button" onClick={reload}>
            Try again
          </button>
        </p>
      )}

      <section className="card" aria-labelledby="balances-title">
        <h2 id="balances-title">Who still owes</h2>
        {balances.length === 0 ? (
          <p className="empty">No members yet. Add the first member below.</p>
        ) : (
          <ul className="balances">
            {balances.map((balance) => (
              <li key={balance.memberId}>
                <span>{balance.name}</span>
                <strong>{formatCents(balance.outstandingCents)}</strong>
              </li>
            ))}
          </ul>
        )}
        <NameForm
          label="New member name"
          buttonLabel="Add member"
          onSubmit={async (name) => {
            await addMember(homeId, name)
            reload()
          }}
        />
      </section>

      <section aria-labelledby="bills-title">
        <h2 id="bills-title">
          Bills {state.refreshing && <span className="muted">updating…</span>}
        </h2>
        <BillList bills={bills} memberNames={memberNames} onChanged={reload} />
        <div className="card">
          <BillForm
            onSubmit={async (title, totalCents) => {
              await createBill(homeId, title, totalCents)
              reload()
            }}
          />
        </div>
      </section>
    </>
  )
}
