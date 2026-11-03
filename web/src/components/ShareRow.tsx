import { useRef, useState } from 'react'
import { ApiClientError, errorMessage, payShare } from '../api'
import { formatCents, newIdempotencyKey } from '../money'
import type { Share } from '../schemas'

type Props = {
  billId: string
  share: Share
  memberName: string
  // Called after the server changed something, so the parent loads fresh data.
  onChanged: () => void
}

export function ShareRow({ billId, share, memberName, onChanged }: Props) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One key per payment attempt. If the request fails (for example a timeout), the next click
  // sends the SAME key, so if the server did get the first request it will not pay twice.
  const keyRef = useRef<string | null>(null)

  const handlePay = async () => {
    setPending(true)
    setError(null)
    keyRef.current ??= newIdempotencyKey()
    try {
      await payShare(billId, share.id, keyRef.current)
      keyRef.current = null
      onChanged()
    } catch (caught) {
      // The share stays unpaid on screen: we only mark it paid after the server says so.
      setError(errorMessage(caught))
      // 409 means someone else already paid it, so refresh to show the real state.
      if (caught instanceof ApiClientError && caught.status === 409) onChanged()
    } finally {
      setPending(false)
    }
  }

  return (
    <li className="share">
      <span className="share-name">{memberName}</span>
      <span className="share-amount">{formatCents(share.amountCents)}</span>
      {share.paidAt ? (
        <span className="paid">Paid {new Date(share.paidAt).toLocaleDateString()}</span>
      ) : (
        <button type="button" onClick={handlePay} disabled={pending}>
          {pending ? 'Paying…' : 'Pay'}
        </button>
      )}
      {error && (
        <p className="error share-error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}
