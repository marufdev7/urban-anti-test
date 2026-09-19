import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Serve cached data while offline; refetch automatically on reconnect.
      networkMode: 'offlineFirst',
      retry: (failureCount, error) => {
        // Never retry auth/permission failures; retry the rest twice.
        if (error instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(error.status)) {
          return false
        }
        return failureCount < 2
      },
      refetchOnWindowFocus: false,
    },
  },
})
