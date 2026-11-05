import { useId } from 'react'
import {
  OPCIONES_POR_PAGINA,
  etiquetaRangoVisible,
  type RangoVisible,
} from '../utils/paginacion'

type Props = {
  rango: RangoVisible
  porPagina: number
  cargando?: boolean
  sustantivo?: string
  onCambiarPagina: (pagina: number) => void
  onCambiarPorPagina?: (porPagina: number) => void
}

export default function Paginacion({
  rango,
  porPagina,
  cargando = false,
  sustantivo = 'equipos',
  onCambiarPagina,
  onCambiarPorPagina,
}: Props) {
  const selectorId = useId()
  const etiqueta = etiquetaRangoVisible(rango, sustantivo)

  return (
    <nav
      aria-label={`Paginación de ${sustantivo}`}
      className="mt-3 flex flex-col items-stretch justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:px-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <span role="status" aria-live="polite" className="font-medium">
          {etiqueta}
        </span>
        {onCambiarPorPagina && (
          <label htmlFor={selectorId} className="flex items-center gap-2 text-slate-600">
            <span>Mostrar por página</span>
            <select
              id={selectorId}
              value={porPagina}
              disabled={cargando}
              onChange={(event) =>
                onCambiarPorPagina(Number(event.target.value))
              }
              className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:opacity-60"
            >
              {OPCIONES_POR_PAGINA.map((opcion) => (
                <option key={opcion} value={opcion}>
                  {opcion} registros
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <button
          type="button"
          disabled={cargando || rango.pagina <= 1}
          onClick={() => onCambiarPagina(rango.pagina - 1)}
          className="min-h-10 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
        >
          Anterior
        </button>
        <span className="shrink-0 px-2 text-center text-slate-600" aria-live="polite">
          Página <strong className="text-slate-900">{rango.pagina}</strong> de{' '}
          <strong className="text-slate-900">{rango.totalPaginas}</strong>
        </span>
        <button
          type="button"
          disabled={cargando || rango.pagina >= rango.totalPaginas}
          onClick={() => onCambiarPagina(rango.pagina + 1)}
          className="min-h-10 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
        >
          Siguiente
        </button>
      </div>
    </nav>
  )
}
