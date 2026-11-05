type Props = {
  estado: string
  situacion?: string | null
  className?: string
}

const etiquetas: Record<string, string> = {
  operativo: 'Operativo',
  con_fallas: 'Operativo con observaciones',
  en_mantenimiento: 'En mantenimiento',
  inoperativo: 'Inoperativo',
  en_almacen: 'En almacén',
}

const estilos: Record<string, string> = {
  operativo: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  con_fallas: 'bg-amber-50 text-amber-900 ring-amber-200',
  en_mantenimiento: 'bg-blue-50 text-blue-800 ring-blue-200',
  inoperativo: 'bg-red-50 text-red-800 ring-red-200',
  en_almacen: 'bg-violet-50 text-violet-800 ring-violet-200',
}

export default function EstadoEquipoBadge({
  estado,
  situacion,
  className = '',
}: Props) {
  const deBaja = situacion === 'baja'
  const archivado = situacion === 'archivado'
  const etiqueta = deBaja
    ? 'Dado de baja'
    : archivado
      ? 'Archivado'
      : etiquetas[estado] ?? estado
  const estilo = deBaja
    ? 'bg-slate-100 text-slate-700 ring-slate-300'
    : archivado
      ? 'bg-slate-100 text-slate-600 ring-slate-200'
      : estilos[estado] ?? 'bg-slate-100 text-slate-700 ring-slate-200'

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-tight ring-1 ring-inset ${estilo} ${className}`}
    >
      {etiqueta}
    </span>
  )
}
