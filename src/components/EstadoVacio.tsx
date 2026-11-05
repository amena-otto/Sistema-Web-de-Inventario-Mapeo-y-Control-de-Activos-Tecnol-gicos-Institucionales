type Props = {
  titulo: string
  descripcion: string
  accion?: {
    etiqueta: string
    onClick: () => void
  }
  tipo?: 'inventario' | 'busqueda' | 'ubicacion' | 'filtro'
}

function Icono({ tipo }: { tipo: NonNullable<Props['tipo']> }) {
  if (tipo === 'busqueda' || tipo === 'filtro') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-7 w-7">
        <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="m15.5 15.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
  if (tipo === 'ubicacion') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-7 w-7">
        <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-7 w-7">
      <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

export default function EstadoVacio({
  titulo,
  descripcion,
  accion,
  tipo = 'inventario',
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icono tipo={tipo} />
      </span>
      <div>
        <p className="font-semibold text-slate-800">{titulo}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{descripcion}</p>
      </div>
      {accion && (
        <button
          type="button"
          onClick={accion.onClick}
          className="min-h-10 rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-800 transition hover:bg-orange-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
        >
          {accion.etiqueta}
        </button>
      )}
    </div>
  )
}
