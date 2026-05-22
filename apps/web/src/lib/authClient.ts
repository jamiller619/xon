import { anonymousClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export default createAuthClient({
  baseURL: 'http://localhost:5173/api/auth',
  plugins: [anonymousClient()],
})
