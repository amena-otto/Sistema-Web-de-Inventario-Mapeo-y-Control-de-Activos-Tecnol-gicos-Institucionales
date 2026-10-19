import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'

export default function RestablecerPassword() {
  const navigate = useNavigate()
  const [contrasena, setContrasena] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  const [actualizada, setActualizada] = useState(false)

  async function cambiarContrasena(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMensaje('')

    if (contrasena.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    if (contrasena !== confirmacion) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setProcesando(true)

    try {
      const { data, error: sesionError } = await supabase.auth.getSession()

      if (sesionError || !data.session) {
        setError(
          'El enlace de recuperación no tiene una sesión válida. Solicita un nuevo enlace e inténtalo otra vez.'
        )
        return
      }

      const { error: cambioError } = await supabase.auth.updateUser({
        password: contrasena,
      })

      if (cambioError) {
        setError(cambioError.message)
        return
      }

      setActualizada(true)
      setMensaje('Tu contraseña se actualizó correctamente.')
    } catch {
      setError('No se pudo actualizar la contraseña. Inténtalo nuevamente.')
    } finally {
      setProcesando(false)
    }
  }

  if (actualizada) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <h1 className="text-2xl font-bold text-slate-900">
            Contraseña actualizada
          </h1>
          <p className="mt-3 text-slate-600">{mensaje}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Ir al inicio de sesión
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-slate-900">
          Restablecer contraseña
        </h1>
        <p className="mt-2 mb-6 text-sm text-slate-500">
          Introduce una contraseña nueva para tu cuenta institucional.
        </p>

        <form onSubmit={cambiarContrasena} className="space-y-4">
          <div>
            <label htmlFor="nueva" className="mb-1 block text-sm font-medium">
              Nueva contraseña
            </label>
            <input
              id="nueva"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <div>
            <label
              htmlFor="confirmacion"
              className="mb-1 block text-sm font-medium"
            >
              Confirmar contraseña
            </label>
            <input
              id="confirmacion"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
              placeholder="Repite la contraseña"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={procesando}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {procesando ? 'Actualizando...' : 'Guardar nueva contraseña'}
          </button>
        </form>
      </section>
    </main>
  )
}
