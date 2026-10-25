import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthContext, type Perfil } from './AuthContextStore'
import { supabase } from '../services/supabaseClient'

export type { Perfil } from './AuthContextStore'

type ResultadoPerfil = { userId: string; perfil: Perfil | null }

const ROLES_VALIDOS = ['admin', 'tecnico', 'consulta'] as const
const ERROR_PERFIL = 'No se pudo verificar tu perfil de usuario.'
const ERROR_CUENTA =
  'Tu cuenta está desactivada o no tiene un rol asignado.'
const ESPERA_MINIMA_VERIFICACION_MS = 30_000
const INTERVALO_VERIFICACION_MS = 60_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [inicializada, setInicializada] = useState(false)
  const [resultado, setResultado] = useState<ResultadoPerfil | null>(null)
  const [errorAcceso, setErrorAcceso] = useState('')

  const userId = session?.user.id ?? null
  const userIdRef = useRef<string | null>(userId)
  const ultimaVerificacionRef = useRef(0)

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

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
      if (!nuevaSesion) setResultado(null)
    })

    return () => {
      vigente = false
      subscription.unsubscribe()
    }
  }, [])

  const cerrarSesionLocal = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) {
      console.error('No se pudo cerrar la sesión local:', error.message)
    }
    setResultado(null)
    setSession(null)
  }, [])

  const consultarPerfil = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nombres, apellidos, rol, activo')
      .eq('id', id)
      .single()

    return { data, error }
  }, [])

  const aplicarPerfil = useCallback(
    async (
      id: string,
      data: Perfil | null,
      error: { message: string } | null,
    ) => {
      if (userIdRef.current !== id) return

      if (error || !data) {
        console.error('No se pudo cargar el perfil:', error?.message)
        setErrorAcceso(ERROR_PERFIL)
        setResultado({ userId: id, perfil: null })
        await cerrarSesionLocal()
        return
      }

      const rolValido = ROLES_VALIDOS.some((rol) => rol === data.rol)

      if (rolValido && data.activo === true) {
        setResultado({ userId: id, perfil: data })
        return
      }

      setErrorAcceso(ERROR_CUENTA)
      setResultado({ userId: id, perfil: null })
      await cerrarSesionLocal()
    },
    [cerrarSesionLocal],
  )

  useEffect(() => {
    if (!userId) return

    ultimaVerificacionRef.current = Date.now()
    let vigente = true

    consultarPerfil(userId).then(({ data, error }) => {
      if (!vigente) return
      void aplicarPerfil(userId, data as Perfil | null, error)
    })

    return () => {
      vigente = false
    }
  }, [userId, consultarPerfil, aplicarPerfil])

  // Revalida el acceso mientras la pestaña está en uso, sin consultar en cada
  // render y con un mínimo de 30 s entre verificaciones.
  const verificarAcceso = useCallback(async () => {
    const id = userIdRef.current
    if (!id) return

    const ahora = Date.now()
    if (ahora - ultimaVerificacionRef.current < ESPERA_MINIMA_VERIFICACION_MS) {
      return
    }

    ultimaVerificacionRef.current = ahora
    const { data, error } = await consultarPerfil(id)
    await aplicarPerfil(id, data as Perfil | null, error)
  }, [consultarPerfil, aplicarPerfil])

  useEffect(() => {
    if (!userId) return

    const verificar = () => {
      void verificarAcceso()
    }
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') verificar()
    }

    window.addEventListener('focus', verificar)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    const intervalo = window.setInterval(verificar, INTERVALO_VERIFICACION_MS)

    return () => {
      window.removeEventListener('focus', verificar)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      window.clearInterval(intervalo)
    }
  }, [userId, verificarAcceso])

  const perfil = resultado && resultado.userId === userId ? resultado.perfil : null
  const cargando =
    !inicializada || (userId !== null && resultado?.userId !== userId)

  const limpiarErrorAcceso = useCallback(() => setErrorAcceso(''), [])

  const cerrarSesion = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        perfil,
        cargando,
        errorAcceso,
        limpiarErrorAcceso,
        cerrarSesion,
        verificarAcceso,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
