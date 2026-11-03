import { createFileRoute } from '@tanstack/react-router'
import { createHome, listHomes } from '../api'
import { NameForm } from '../components/Forms'
import { HomeView } from '../components/HomeView'
import { useLoad } from '../useLoad'

export const Route = createFileRoute('/')({
  // The chosen home lives in the address (/?home=ID), so a refresh keeps it.
  validateSearch: (search: Record<string, unknown>): { home?: string } =>
    typeof search.home === 'string' && search.home !== '' ? { home: search.home } : {},
  component: Home,
})

function Home() {
  const { home: homeId } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { state, reload } = useLoad(listHomes)

  return (
    <main className="page">
      <h1>Bill Splitter</h1>

      <section className="card" aria-labelledby="homes-title">
        <h2 id="homes-title">Home</h2>

        {state.status === 'loading' && <p role="status">Loading homes…</p>}

        {state.status === 'error' && (
          <>
            <p className="error" role="alert">
              {state.message}
            </p>
            <button type="button" onClick={reload}>
              Try again
            </button>
          </>
        )}

        {state.status === 'success' &&
          (state.data.length === 0 ? (
            <p className="empty">No homes yet. Create the first one.</p>
          ) : (
            <label>
              Choose a home
              <select
                value={homeId ?? ''}
                onChange={(event) =>
                  navigate({ search: event.target.value ? { home: event.target.value } : {} })
                }
              >
                <option value="">Select…</option>
                {state.data.map((home) => (
                  <option key={home.id} value={home.id}>
                    {home.name}
                  </option>
                ))}
              </select>
            </label>
          ))}

        <NameForm
          label="New home name"
          buttonLabel="Create home"
          onSubmit={async (name) => {
            const created = await createHome(name)
            reload()
            await navigate({ search: { home: created.id } })
          }}
        />
      </section>

      {homeId ? <HomeView key={homeId} homeId={homeId} /> : null}
    </main>
  )
}
