import { formatCents } from '../money'
import type { Bill } from '../schemas'
import { ShareRow } from './ShareRow'

type Props = {
  bills: Bill[]
  memberNames: ReadonlyMap<string, string>
  onChanged: () => void
}

export function BillList({ bills, memberNames, onChanged }: Props) {
  if (bills.length === 0) {
    return <p className="empty">No bills yet. Add a member, then add a bill to split it.</p>
  }

  return (
    <ul className="bills">
      {bills.map((bill) => (
        <li key={bill.id} className="card">
          <h3>
            {bill.title} <span className="muted">{formatCents(bill.totalCents)}</span>
          </h3>
          <ul className="shares">
            {bill.shares.map((share) => (
              <ShareRow
                key={share.id}
                billId={bill.id}
                share={share}
                memberName={memberNames.get(share.memberId) ?? 'Unknown member'}
                onChanged={onChanged}
              />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
