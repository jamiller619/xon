import { Button } from '@xon/ui'
import authClient from '~/lib/authClient'

export default function Login() {
  return (
    <div>
      <h1>Login</h1>
      <Button>Login</Button>
    </div>
  )
}

// import { type FormEvent, useEffect, useState } from 'react'
// import { useNavigate } from 'react-router-dom'
// import { useAuthStore } from '~/store/authStore'
// import styles from './Login.module.css'

// export default function Login() {
//   const [username, setUsername] = useState('')
//   const [password, setPassword] = useState('')
//   const [error, setError] = useState<string | null>(null)
//   const [loading, setLoading] = useState(false)
//   const setAuth = useAuthStore((s) => s.setAuth)
//   const navigate = useNavigate()

//   // Redirect to setup wizard if no users have been created yet
//   useEffect(() => {
//     fetch('/api/auth/setup-status')
//       .then((r) => r.json())
//       .then((data: { setupComplete: boolean }) => {
//         if (!data.setupComplete) {
//           navigate('/setup', { replace: true })
//         }
//       })
//       .catch(() => {})
//   }, [navigate])

//   async function handleSubmit(e: FormEvent) {
//     e.preventDefault()
//     setError(null)
//     setLoading(true)

//     try {
//       const res = await fetch('/api/auth/login', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ username, password }),
//       })

//       if (!res.ok) {
//         const body = (await res.json()) as { error?: string }
//         setError(body.error ?? 'Login failed')
//         return
//       }

//       const body = (await res.json()) as { accessToken: string }
//       // Decode username and role from the JWT payload (no library needed — just base64)
//       const [, payloadB64] = body.accessToken.split('.')
//       const payload = JSON.parse(atob(payloadB64 ?? '')) as {
//         username: string
//         role: string
//       }
//       setAuth(body.accessToken, payload.username, payload.role)
//       navigate('/', { replace: true })
//     } catch {
//       setError('Network error — please try again')
//     } finally {
//       setLoading(false)
//     }
//   }

//   return (
//     <div className={styles.page}>
//       <div className={styles.card}>
//         <div className={styles.logo}>
//           <span className={styles.logoText}>xon</span>
//         </div>
//         <h1 className={styles.heading}>Sign in</h1>
//         <form className={styles.form} onSubmit={handleSubmit}>
//           <div className={styles.field}>
//             <label htmlFor="username" className={styles.label}>
//               Username
//             </label>
//             <input
//               id="username"
//               type="text"
//               autoComplete="username"
//               value={username}
//               onChange={(e) => setUsername(e.target.value)}
//               className={styles.input}
//               required
//             />
//           </div>
//           <div className={styles.field}>
//             <label htmlFor="password" className={styles.label}>
//               Password
//             </label>
//             <input
//               id="password"
//               type="password"
//               autoComplete="current-password"
//               value={password}
//               onChange={(e) => setPassword(e.target.value)}
//               className={styles.input}
//               required
//             />
//           </div>
//           {error && <div className={styles.error}>{error}</div>}
//           <button type="submit" className={styles.button} disabled={loading}>
//             {loading ? 'Signing in…' : 'Sign in'}
//           </button>
//         </form>
//       </div>
//     </div>
//   )
// }
