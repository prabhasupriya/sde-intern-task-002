import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { routeTree } from './routeTree.gen'
import './styles.css'

// If something unexpected breaks while rendering, show a message instead of a blank page.
function ErrorScreen() {
  return (
    <main className="page">
      <h1>Something went wrong</h1>
      <p className="error" role="alert">
        The page hit an unexpected problem. Please reload.
      </p>
      <button type="button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </main>
  )
}

const router = createRouter({ routeTree, defaultErrorComponent: ErrorScreen })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('root element missing')

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
