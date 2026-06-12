const ROUTES = {
  libraries: '/api/libraries',
  groups: '/api/groups',
  recentMedia: '/api/media?sortBy=createdAt&order=desc&page=1&limit=10',
  setupStatus: '/api/auth/setup-status',
} as const

export default function useQueryAPIHelper(route: keyof typeof ROUTES) {
  return {
    queryKey: [route],
    queryFn: async () => {
      const res = await fetch(ROUTES[route])

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
