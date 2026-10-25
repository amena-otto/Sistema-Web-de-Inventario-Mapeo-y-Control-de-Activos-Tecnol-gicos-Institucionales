import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../services/supabaseClient'

const RUTA_INICIO = '/dashboard'
const RUTAS_NO_RETORNO = ['/', '/login', '/restablecer-password']

function rutaRetornoSegura(valor: unknown) {
  if (
    typeof valor !== 'string' ||
    !valor.startsWith('/') ||
    valor.startsWith('//') ||
    valor.includes('\\')
  ) {
    return RUTA_INICIO
  }
  try {
    const destino = new URL(valor, window.location.origin)
    if (destino.origin !== window.location.origin) return RUTA_INICIO
    if (RUTAS_NO_RETORNO.includes(destino.pathname)) return RUTA_INICIO
    return `${destino.pathname}${destino.search}${destino.hash}`
  } catch {
    return RUTA_INICIO
  }
}

export default function Login() {
  const { session, perfil, cargando, errorAcceso, limpiarErrorAcceso } = useAuth()
  const location = useLocation()
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const rutaDespuesDeLogin = rutaRetornoSegura(
    (location.state as { from?: unknown } | null)?.from,
  )

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Verificando sesión...
      </div>
    )
  }

  if (session && perfil) {
    return <Navigate to={rutaDespuesDeLogin} replace />
  }

  async function iniciarSesion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    limpiarErrorAcceso()
    setEnviando(true)

    try {
      const { error: errorLogin } = await supabase.auth.signInWithPassword({
        email: correo.trim(),
        password: contrasena,
      })

      if (errorLogin) {
        setError('No se pudo iniciar sesión. Verifica tus credenciales.')
      }
    } catch {
      setError('Ocurrió un error al conectar con el servicio.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 text-2xl font-bold text-white">
            OT
          </div>

          <h1 className="text-2xl font-bold text-slate-900">Inventario OT</h1>

          <p className="mt-2 text-sm text-slate-500">
            Sistema de Inventario, Mapeo y Control de Activos Tecnológicos
          </p>

          <p className="mt-1 text-sm text-slate-500">
            IES Privado Otto Tonsmann
          </p>
        </div>

        <form onSubmit={iniciarSesion} className="space-y-5">
          <div>
            <label
              htmlFor="correo"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Correo institucional
            </label>

            <input
              id="correo"
              type="email"
              autoComplete="username"
              required
              value={correo}
              onChange={(event) => setCorreo(event.target.value)}
              placeholder="usuario@ottotonsmann.edu.pe"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label
              htmlFor="contrasena"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Contraseña
            </label>

            <input
              id="contrasena"
              type="password"
              autoComplete="current-password"
              required
              value={contrasena}
              onChange={(event) => setContrasena(event.target.value)}
              placeholder="Ingresa tu contraseña"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {(error || errorAcceso) && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error || errorAcceso}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Acceso exclusivo para usuarios autorizados.
        </p>
      </section>
    </main>
  )
}
