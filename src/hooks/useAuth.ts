import { useContext } from 'react'
import { AuthContext } from './AuthContextStore'

export function useAuth() {
  const contexto = useContext(AuthContext)

  if (!contexto) {
    throw new Error('useAuth debe utilizarse dentro de AuthProvider')
  }

  return contexto
}
