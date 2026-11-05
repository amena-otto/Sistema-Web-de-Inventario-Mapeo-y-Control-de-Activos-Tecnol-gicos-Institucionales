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
      className="flex flex-col gap-3 text-sm text-slate-700 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span role="status" aria-live="polite" className="font-medium">
          {etiqueta}
        </span>
        {onCambiarPorPagina && (
          <label htmlFor={selectorId} className="flex items-center gap-2 text-slate-600">
            <span>Mostrar</span>
            <select
              id={selectorId}
              value={porPagina}
              disabled={cargando}
              onChange={(event) =>
                onCambiarPorPagina(Number(event.target.value))
              }
              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:opacity-60"
            >
              {OPCIONES_POR_PAGINA.map((opcion) => (
                <option key={opcion} value={opcion}>
                  {opcion}
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
          className="min-h-9 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
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
          className="min-h-9 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
        >
          Siguiente
        </button>
      </div>
    </nav>
  )
}
