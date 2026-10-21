import {
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthContext, type Perfil } from './AuthContextStore'
import { supabase } from '../services/supabaseClient'

export type { Perfil } from './AuthContextStore'

type ResultadoPerfil = { userId: string; perfil: Perfil | null }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [inicializada, setInicializada] = useState(false)
  const [resultado, setResultado] = useState<ResultadoPerfil | null>(null)
  const [errorAcceso, setErrorAcceso] = useState('')

  const userId = session?.user.id ?? null

  useEffect(() => {
    let vigente = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!vigente) return
      if (error) console.error('Error al recuperar la sesión:', error.message)
      setSession(data.session ?? null)
      setInicializada(true)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSession(nuevaSesion)
    })

    return () => {
      vigente = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!userId) return

    let vigente = true

    const cargarPerfil = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nombres, apellidos, rol, activo')
        .eq('id', userId)
        .single()

      if (!vigente) return

      if (error || !data) {
        console.error('No se pudo cargar el perfil:', error?.message)
        setErrorAcceso('No se pudo verificar tu perfil de usuario.')
        setResultado({ userId, perfil: null })
        await supabase.auth.signOut()
        return
      }

      const rolValido = ['admin', 'tecnico', 'consulta'].includes(data.rol)

      if (rolValido && data.activo === true) {
        setResultado({ userId, perfil: data as Perfil })
      } else {
        setErrorAcceso('Tu cuenta está desactivada o no tiene un rol asignado.')
        setResultado({ userId, perfil: null })
        await supabase.auth.signOut()
      }
    }

    void cargarPerfil()

    return () => {
      vigente = false
    }
  }, [userId])

  const perfil = resultado && resultado.userId === userId ? resultado.perfil : null
  const cargando =
    !inicializada || (userId !== null && resultado?.userId !== userId)

  const limpiarErrorAcceso = () => setErrorAcceso('')

  const cerrarSesion = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        perfil,
        cargando,
        errorAcceso,
        limpiarErrorAcceso,
        cerrarSesion,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
