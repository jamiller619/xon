import { anonymousClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export default createAuthClient({
  plugins: [anonymousClient()],
  fetchOptions: {
    credentials: 'include',
  },
})
