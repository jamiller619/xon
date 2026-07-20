import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from '~/App'
import { configQuery } from '~/hooks/useConfig'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

// Kick off the config fetch immediately, in parallel with module evaluation
// and the auth session check, instead of blocking the whole app on it.
void queryClient.prefetchQuery(configQuery)

const app = (
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)

// Use hydrateRoot when SSR has injected element children; createRoot otherwise
if (rootEl.firstElementChild !== null) {
  hydrateRoot(rootEl, app)
} else {
  createRoot(rootEl).render(app)
}
