import { anonymousClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { getWebClientName } from './clientName'

export default createAuthClient({
  plugins: [anonymousClient()],
  fetchOptions: {
    credentials: 'include',
    headers: {
      'X-Xon-Client-Name': getWebClientName(),
    },
  },
})
