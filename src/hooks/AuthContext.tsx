
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../services/supabaseClient'

export type Perfil = {
  id: string
  nombres: string
  apellidos: string
  rol: 'admin' | 'tecnico' | 'consulta'
  activo: boolean
}

type AuthContextType = {
  session: Session | null
  perfil: Perfil | null
  cargando: boolean
  cerrarSesion: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true

    const inicializar = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (!vigente) return

      if (error) {
        console.error('Error al recuperar la sesión:', error.message)
      }

      setSession(data?.session ?? null)
      setCargando(false)
    }

    void inicializar()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nuevaSesion) => {
      setSession(nuevaSesion)
    })

    return () => {
      vigente = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let vigente = true

    const cargarPerfil = async () => {
      setPerfil(null)

      if (!session?.user) {
        setCargando(false)
        return
      }

      setCargando(true)

      const { data, error } = await supabase
        .from('profiles')
        .select('id, nombres, apellidos, rol, activo')
        .eq('id', session.user.id)
        .single()

      if (!vigente) return

      if (error || !data) {
        console.error('No se pudo cargar el perfil:', error?.message)
        setPerfil(null)
      } else if (
        ['admin', 'tecnico', 'consulta'].includes(data.rol) &&
        data.activo === true
      ) {
        setPerfil(data as Perfil)
      } else {
        setPerfil(null)
        await supabase.auth.signOut()
      }

      setCargando(false)
    }

    void cargarPerfil()

    return () => {
      vigente = false
    }
  }, [session])

  const cerrarSesion = async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      throw error
    }
  }

  return (
    <AuthContext.Provider
      value={{ session, perfil, cargando, cerrarSesion }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const contexto = useContext(AuthContext)

  if (!contexto) {
    throw new Error('useAuth debe utilizarse dentro de AuthProvider')
  }

  return contexto
}
