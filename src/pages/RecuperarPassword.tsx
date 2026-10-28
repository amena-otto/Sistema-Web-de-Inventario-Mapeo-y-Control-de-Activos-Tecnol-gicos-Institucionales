import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'

export default function RecuperarPassword() {
  const [correo, setCorreo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  async function solicitar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEnviando(true)
    setMensaje('')
    try {
      // La misma respuesta para cuentas existentes, inexistentes y errores del servicio.
      await supabase.auth.resetPasswordForEmail(correo.trim(), {
        redirectTo: `${window.location.origin}/restablecer-password`,
      })
    } catch {
      // No revelar información sobre el registro del correo.
    } finally {
      setMensaje('Si el correo está registrado, recibirás un enlace para recuperar el acceso. Revisa también spam. Si no llega, espera unos minutos e inténtalo nuevamente.')
      setEnviando(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-slate-900">Recuperar contraseña</h1>
        <p className="mt-2 mb-6 text-sm text-slate-500">Ingresa el correo asociado a tu cuenta.</p>
        <form onSubmit={solicitar} className="space-y-4">
          <label htmlFor="correo-recuperacion" className="block text-sm font-medium">Correo electrónico</label>
          <input id="correo-recuperacion" type="email" autoComplete="email" required maxLength={254}
            value={correo} onChange={(event) => setCorreo(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-4 py-3" />
          {mensaje && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{mensaje}</p>}
          <button disabled={enviando} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {enviando ? 'Solicitando...' : 'Solicitar recuperación'}
          </button>
          <Link to="/login" className="block text-center text-sm text-blue-600 hover:underline">Volver al inicio de sesión</Link>
        </form>
      </section>
    </main>
  )
}
