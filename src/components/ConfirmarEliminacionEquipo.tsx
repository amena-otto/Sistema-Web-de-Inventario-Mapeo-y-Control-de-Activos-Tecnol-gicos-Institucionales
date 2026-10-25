import { useState, type FormEvent } from 'react'
import { eliminarEquipoDadoDeBaja, type Equipo } from '../services/equiposService'

type Props = {
  equipo: Equipo
  onCancelar: () => void
  onEliminado: (equipo: Equipo) => void
}

function mostrarError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return fallback
}

export default function ConfirmarEliminacionEquipo({
  equipo,
  onCancelar,
  onEliminado,
}: Props) {
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [eliminando, setEliminando] = useState(false)

  async function confirmar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (eliminando) return
    if (codigo !== equipo.codigo_institucional) {
      setError('El código ingresado no coincide con el código institucional.')
      return
    }
    setError('')
    setEliminando(true)
    try {
      await eliminarEquipoDadoDeBaja(equipo.id, codigo)
      onEliminado(equipo)
    } catch (e) {
      setError(mostrarError(e, 'No se pudo eliminar definitivamente el equipo.'))
      setEliminando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="eliminar-equipo-titulo"
        onSubmit={(event) => void confirmar(event)}
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"
      >
        <h3 id="eliminar-equipo-titulo" className="text-lg font-bold text-slate-900">
          Eliminar definitivamente el equipo
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Esta acción borra <strong className="break-all">{equipo.codigo_institucional}</strong> y su historial de componentes, fotografías, mantenimientos y movimientos. No se puede deshacer.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          La constancia de la baja definitiva y el registro de auditoría se conservarán.
        </p>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Escribe el código institucional para confirmar
          <input
            autoFocus
            required
            autoComplete="off"
            spellCheck={false}
            value={codigo}
            onChange={(event) => setCodigo(event.target.value)}
            placeholder={equipo.codigo_institucional}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={eliminando}
            onClick={onCancelar}
            className="min-h-10 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={eliminando || codigo !== equipo.codigo_institucional}
            className="min-h-10 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {eliminando ? 'Eliminando...' : 'Eliminar definitivamente'}
          </button>
        </div>
      </form>
    </div>
  )
}
