import { type FormEvent, useState } from 'react'
import { errorMessage } from '../api'
import { parseDollarsToCents } from '../money'

type FormStatus = { pending: boolean; error: string | null }

// Runs a submit action and keeps track of "sending" and "failed". A failure never throws
// into React, it becomes a message next to the form.
function useSubmit() {
  const [status, setStatus] = useState<FormStatus>({ pending: false, error: null })

  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setStatus({ pending: true, error: null })
    try {
      await action()
      setStatus({ pending: false, error: null })
      return true
    } catch (error) {
      setStatus({ pending: false, error: errorMessage(error) })
      return false
    }
  }
  return { status, run, fail: (error: string) => setStatus({ pending: false, error }) }
}

type NameFormProps = {
  label: string
  buttonLabel: string
  onSubmit: (name: string) => Promise<void>
}

export function NameForm({ label, buttonLabel, onSubmit }: NameFormProps) {
  const [name, setName] = useState('')
  const { status, run, fail } = useSubmit()

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return fail('Please enter a name.')
    if (await run(() => onSubmit(trimmed))) setName('')
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label>
        {label}
        <input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
      </label>
      <button type="submit" disabled={status.pending}>
        {status.pending ? 'Saving…' : buttonLabel}
      </button>
      {status.error && (
        <p className="error" role="alert">
          {status.error}
        </p>
      )}
    </form>
  )
}

type BillFormProps = {
  onSubmit: (title: string, totalCents: number) => Promise<void>
}

export function BillForm({ onSubmit }: BillFormProps) {
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const { status, run, fail } = useSubmit()

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return fail('Please enter a title.')
    const totalCents = parseDollarsToCents(amount)
    if (totalCents === null) return fail('Enter an amount above 0 with at most 2 decimals.')
    if (await run(() => onSubmit(trimmed, totalCents))) {
      setTitle('')
      setAmount('')
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label>
        Bill title
        <input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Total (dollars)
        <input
          value={amount}
          inputMode="decimal"
          placeholder="10.00"
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <button type="submit" disabled={status.pending}>
        {status.pending ? 'Splitting…' : 'Add and split bill'}
      </button>
      {status.error && (
        <p className="error" role="alert">
          {status.error}
        </p>
      )}
    </form>
  )
}
