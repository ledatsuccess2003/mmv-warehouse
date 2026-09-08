import { Navigate } from 'react-router-dom'
import { useAuth } from '@/store/useAuth'
import { Layout } from './Layout'
import type { Role } from '@/lib/types'

interface Props {
  children: React.ReactNode
  roles?: Role[] // nếu có -> chỉ các vai trò này vào được
}

export function ProtectedRoute({ children, roles }: Props) {
  const user = useAuth((s) => s.user)

  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/home" replace />

  return <Layout>{children}</Layout>
}
