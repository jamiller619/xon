import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useQueryAPIHelper from '~/hooks/useQueryAPIHelper'

export default function RequireSetup({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { data, isPending, error } = useQuery<{
    users: boolean
    libraries: boolean
  }>(useQueryAPIHelper('setupStatus'))

  useEffect(() => {
    if (!data?.users || !data.libraries) {
      navigate('/setup', { replace: true })
    }
  }, [data, navigate])

  if (isPending) return <p>Loading...</p>
  if (error) return <p>Error: {error.message}</p>

  return children
}
