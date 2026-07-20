const ROUTES = {
  libraries: '/api/libraries',
  groups: '/api/groups',
  mediaById: '/api/media/:id',
  mediaByLibrary: '/api/libraries/:libraryId/media',
  recentMedia: '/api/media?sortBy=createdAt&order=desc&page=1&limit=10',
  featuredMedia: '/api/media/featured',
  setupStatus: '/api/auth/setup-status',
} as const

export default function useQueryAPIHelper(
  route: keyof typeof ROUTES,
  // biome-ignore lint/suspicious/noExplicitAny: fine
  data?: any,
) {
  const key = [route]

  if (data) {
    key.push(data)
  }

  return {
    queryKey: key,
    queryFn: async () => {
      const params = data ? new URLSearchParams(data) : undefined
      let url: string = ROUTES[route]

      if (params) {
        url = url.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
          const value = data[key]

          if (value === undefined) {
            return ''
          }

          return encodeURIComponent(value)
        })
      }

      const res = await fetch(url)

      if (!res.ok) throw new Error(res.statusText)

      return res.json()
    },
  }
}

export function useMutationHelper<T>(
  route: keyof typeof ROUTES,
  getData?: (data: T) => T,
) {
  return {
    mutationFn: (data: T) => {
      const newData = getData
        ? { ...getData(data) }
        : {
            ...data,
          }

      return fetch(ROUTES[route], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newData),
      })
    },
  }
}
