import { Hono } from 'hono'
import { ApiError } from './errors'
import { bills } from './routes/bills'
import { homes } from './routes/homes'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.route('/api/homes', homes)
app.route('/api', bills)

// Every error answers with JSON: { "error": "message" }.
app.notFound((c) => c.json({ error: 'route not found' }, 404))

app.onError((error, c) => {
  if (error instanceof ApiError) return c.json({ error: error.message }, error.status)
  // Unknown failure: log the details for us, tell the caller nothing private.
  console.error(error)
  return c.json({ error: 'internal server error' }, 500)
})

export default app
