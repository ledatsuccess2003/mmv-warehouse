import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/lib/types'

interface AuthState {
  user: User | null
  login: (user: User) => void
  logout: () => void
  isAdmin: () => boolean
  isManager: () => boolean
  isWarehouse: () => boolean
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      login: (user) => set({ user }),
      logout: () => set({ user: null }),
      isAdmin: () => {
        const r = get().user?.role
        return r === 'admin'
      },
      isManager: () => {
        const r = get().user?.role
        return r === 'manager' || r === 'sales' || r === 'admin'
      },
      isWarehouse: () => {
        const r = get().user?.role
        return r === 'warehouse' || r === 'manager' || r === 'admin'
      },
    }),
    { name: 'mmv.auth' }
  )
)
