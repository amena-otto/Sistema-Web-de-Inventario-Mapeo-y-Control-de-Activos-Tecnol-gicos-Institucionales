import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type Perfil = {
  id: string
  nombres: string
  apellidos: string
  rol: 'admin' | 'tecnico' | 'consulta'
  activo: boolean
}

export type AuthContextType = {
  session: Session | null
  perfil: Perfil | null
  cargando: boolean
  errorAcceso: string
  limpiarErrorAcceso: () => void
  cerrarSesion: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)
