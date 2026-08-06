import { QueryClient } from '@tanstack/react-query'

export const PLAY_PROGRESS_QUERY_KEY = ['playProgress'] as const

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
