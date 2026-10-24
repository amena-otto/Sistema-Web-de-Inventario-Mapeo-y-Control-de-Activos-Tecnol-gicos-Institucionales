import { supabase } from './supabaseClient'

export type ResumenDashboard = {
  totalEquipos: number
  equiposActivos: number
  equiposBaja: number
  equiposArchivados: number
  equiposOperativos: number
  equiposConFallas: number
  equiposAlmacen: number
  equiposMantenimiento: number
  equiposInoperativos: number
  categorias: { id: string; nombre: string; cantidad: number }[]
  pabellones: { id: string; nombre: string; cantidad: number; ambientesIds: string[] }[]
  pisos: { id: string; nombre: string; pabellon: string; cantidad: number; ambientesIds: string[] }[]
  ubicaciones: {
    id: string
    pabellon: string
    piso: string
    codigo: string
    ambiente: string
    cantidad: number
  }[]
  opcionesPabellon: { id: string; nombre: string }[]
  opcionesPiso: { id: string; nombre: string }[]
  opcionesAmbiente: { id: string; codigo: string; nombre: string }[]
  equiposSinUbicacion: number
  mantenimientos: {
    total: number
    pendientes: number
    enProceso: number
    completados: number
    revisionVencida: number
  } | null
}

type EquipoDashboard = {
  id: string
  ambiente_id: string | null
  categoria_id: string
  estado_operativo: string
  situacion: string
}

type AmbienteDashboard = {
  id: string
  codigo: string
  nombre: string
  activo: boolean
  pisos: { id: string; nombre: string; pabellones: { id: string; nombre: string } }
}

export type FiltrosDashboard = {
  pabellonId: string
  pisoId: string
  ambienteId: string
}

async function contarMantenimientos(estado: string) {
  const { count, error } = await supabase
    .from('mantenimientos')
    .select('id', { count: 'exact', head: true })
    .eq('estado', estado)
  if (error) throw error
  return count ?? 0
}

async function contarMantenimientosPorEquipos(estado: string, equipoIds: string[]) {
  if (equipoIds.length === 0) return 0
  let total = 0
  for (let inicio = 0; inicio < equipoIds.length; inicio += 400) {
    const { count, error } = await supabase
      .from('mantenimientos')
      .select('id', { count: 'exact', head: true })
      .eq('estado', estado)
      .in('equipo_id', equipoIds.slice(inicio, inicio + 400))
    if (error) throw error
    total += count ?? 0
  }
  return total
}

async function contarEquiposConRevisionVencida(equipoIds?: string[]) {
  if (equipoIds === undefined) {
    const { data, error } = await supabase.rpc('indicadores_mantenimiento')
    if (error) throw error
    return Number(data?.[0]?.equipos_revision_vencida ?? 0)
  }

  const equiposVencidos = new Set<string>()
  if (equipoIds.length === 0) return 0
  const fecha = new Date()
  fecha.setMinutes(fecha.getMinutes() - fecha.getTimezoneOffset())
  const hoy = fecha.toISOString().slice(0, 10)

  for (let inicio = 0; inicio < equipoIds.length; inicio += 400) {
    const { data, error } = await supabase
      .from('mantenimientos')
      .select('equipo_id')
      .in('equipo_id', equipoIds.slice(inicio, inicio + 400))
      .lte('proxima_revision', hoy)
      .neq('estado', 'completado')
    if (error) throw error
    for (const registro of data ?? []) equiposVencidos.add(registro.equipo_id)
  }
  return equiposVencidos.size
}

export async function obtenerResumenDashboard(
  puedeVerMantenimientos: boolean,
  filtros: FiltrosDashboard = { pabellonId: '', pisoId: '', ambienteId: '' },
): Promise<ResumenDashboard> {
  const equipos: EquipoDashboard[] = []
  const limite = 500

  for (let desde = 0; ; desde += limite) {
    const { data, error } = await supabase
      .from('equipos')
      .select('id, ambiente_id, categoria_id, estado_operativo, situacion')
      .order('id')
      .range(desde, desde + limite - 1)
    if (error) throw error

    const lote = (data ?? []) as EquipoDashboard[]
    equipos.push(...lote)
    if (lote.length < limite) break
  }

  const [ambientesResult, categoriasResult] = await Promise.all([
    supabase
      .from('ambientes')
      .select('id, codigo, nombre, activo, pisos!inner(id, nombre, pabellones!inner(id, nombre))'),
    supabase.from('categorias_equipos').select('id, nombre'),
  ])
  if (ambientesResult.error) throw ambientesResult.error
  if (categoriasResult.error) throw categoriasResult.error

  const ambientes = (ambientesResult.data ?? []) as unknown as AmbienteDashboard[]
  const ambientesPorId = new Map(ambientes.map((ambiente) => [ambiente.id, ambiente]))
  const pabellonesMap = new Map<string, string>()
  const pisosMap = new Map<string, { nombre: string; pabellonId: string }>()
  for (const ambiente of ambientes) {
    pabellonesMap.set(ambiente.pisos.pabellones.id, ambiente.pisos.pabellones.nombre)
    pisosMap.set(ambiente.pisos.id, {
      nombre: ambiente.pisos.nombre,
      pabellonId: ambiente.pisos.pabellones.id,
    })
  }

  const ambientesFiltrados = ambientes.filter((ambiente) =>
    (!filtros.pabellonId || ambiente.pisos.pabellones.id === filtros.pabellonId) &&
    (!filtros.pisoId || ambiente.pisos.id === filtros.pisoId) &&
    (!filtros.ambienteId || ambiente.id === filtros.ambienteId),
  )
  const equiposFiltrados = equipos.filter((equipo) => {
    if (!filtros.pabellonId && !filtros.pisoId && !filtros.ambienteId) return true
    const ambiente = equipo.ambiente_id
      ? ambientesPorId.get(equipo.ambiente_id)
      : undefined
    return Boolean(
      ambiente &&
      (!filtros.pabellonId || ambiente.pisos.pabellones.id === filtros.pabellonId) &&
      (!filtros.pisoId || ambiente.pisos.id === filtros.pisoId) &&
      (!filtros.ambienteId || ambiente.id === filtros.ambienteId),
    )
  })
  const categorias = (categoriasResult.data ?? []).map((categoria) => ({
    ...categoria,
    cantidad: 0,
  }))
  const categoriasPorId = new Map(categorias.map((categoria) => [categoria.id, categoria]))
  const pabellones = [...new Set(
    ambientesFiltrados.map((ambiente) => ambiente.pisos.pabellones.id),
  )].map((id) => ({
    id,
    nombre: pabellonesMap.get(id) ?? 'Sin pabellón',
    cantidad: 0,
    ambientesIds: ambientesFiltrados
      .filter((ambiente) => ambiente.pisos.pabellones.id === id)
      .map((ambiente) => ambiente.id),
  }))
  const pabellonesPorId = new Map(pabellones.map((pabellon) => [pabellon.id, pabellon]))
  const pisos = [...new Set(ambientesFiltrados.map((ambiente) => ambiente.pisos.id))]
    .map((id) => {
      const piso = pisosMap.get(id)
      return {
        id,
        nombre: piso?.nombre ?? 'Sin piso',
        pabellon: piso ? pabellonesMap.get(piso.pabellonId) ?? 'Sin pabellón' : 'Sin pabellón',
        cantidad: 0,
        ambientesIds: ambientesFiltrados
          .filter((ambiente) => ambiente.pisos.id === id)
          .map((ambiente) => ambiente.id),
      }
    })
  const pisosPorId = new Map(pisos.map((piso) => [piso.id, piso]))
  const ubicacionesMap = new Map(
    ambientesFiltrados.map((ambiente) => [
      ambiente.id,
      {
        id: ambiente.id,
        pabellon: ambiente.pisos.pabellones.nombre,
        piso: ambiente.pisos.nombre,
        codigo: ambiente.codigo,
        ambiente: ambiente.nombre,
        cantidad: 0,
      },
    ]),
  )

  let equiposActivos = 0
  let equiposBaja = 0
  let equiposArchivados = 0
  let equiposOperativos = 0
  let equiposConFallas = 0
  let equiposAlmacen = 0
  let equiposMantenimiento = 0
  let equiposInoperativos = 0
  let equiposSinUbicacion = 0

  for (const equipo of equiposFiltrados) {
    const categoria = categoriasPorId.get(equipo.categoria_id)
    if (categoria) categoria.cantidad += 1

    const ambiente = equipo.ambiente_id
      ? ambientesPorId.get(equipo.ambiente_id)
      : undefined
    if (!ambiente) {
      equiposSinUbicacion += 1
    } else {
      const ubicacion = ubicacionesMap.get(ambiente.id)
      if (ubicacion) ubicacion.cantidad += 1
      const pabellon = pabellonesPorId.get(ambiente.pisos.pabellones.id)
      if (pabellon) pabellon.cantidad += 1
      const piso = pisosPorId.get(ambiente.pisos.id)
      if (piso) piso.cantidad += 1
    }

    if (equipo.situacion === 'baja') {
      equiposBaja += 1
      continue
    }
    if (equipo.situacion === 'archivado') {
      equiposArchivados += 1
      continue
    }
    if (equipo.situacion !== 'activo') continue

    equiposActivos += 1
    if (equipo.estado_operativo === 'operativo') equiposOperativos += 1
    if (equipo.estado_operativo === 'con_fallas') equiposConFallas += 1
    if (equipo.estado_operativo === 'en_almacen') equiposAlmacen += 1
    if (equipo.estado_operativo === 'en_mantenimiento') equiposMantenimiento += 1
    if (equipo.estado_operativo === 'inoperativo') equiposInoperativos += 1

  }

  const hayFiltroUbicacion = Boolean(
    filtros.pabellonId || filtros.pisoId || filtros.ambienteId,
  )
  const equiposIdsFiltrados = equiposFiltrados.map((equipo) => equipo.id)
  const mantenimientos = puedeVerMantenimientos
    ? await Promise.all([
        hayFiltroUbicacion
          ? contarMantenimientosPorEquipos('pendiente', equiposIdsFiltrados)
          : contarMantenimientos('pendiente'),
        hayFiltroUbicacion
          ? contarMantenimientosPorEquipos('en_proceso', equiposIdsFiltrados)
          : contarMantenimientos('en_proceso'),
        hayFiltroUbicacion
          ? contarMantenimientosPorEquipos('completado', equiposIdsFiltrados)
          : contarMantenimientos('completado'),
        contarEquiposConRevisionVencida(
          hayFiltroUbicacion ? equiposIdsFiltrados : undefined,
        ),
      ]).then(([pendientes, enProceso, completados, revisionVencida]) => {
        return {
          total: pendientes + enProceso + completados,
          pendientes,
          enProceso,
          completados,
          revisionVencida,
        }
      })
    : null

  return {
    totalEquipos: equiposFiltrados.length,
    equiposActivos,
    equiposBaja,
    equiposArchivados,
    equiposOperativos,
    equiposConFallas,
    equiposAlmacen,
    equiposMantenimiento,
    equiposInoperativos,
    categorias: categorias.sort(
      (a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre),
    ),
    pabellones: pabellones.sort(
      (a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre),
    ),
    pisos: pisos.sort(
      (a, b) =>
        a.pabellon.localeCompare(b.pabellon) ||
        a.nombre.localeCompare(b.nombre),
    ),
    ubicaciones: [...ubicacionesMap.values()].sort(
      (a, b) =>
        a.pabellon.localeCompare(b.pabellon) ||
        a.piso.localeCompare(b.piso) ||
        a.codigo.localeCompare(b.codigo),
    ),
    equiposSinUbicacion,
    opcionesPabellon: [...pabellonesMap.entries()]
      .filter(([id]) => ambientes.some((ambiente) =>
        ambiente.activo && ambiente.pisos.pabellones.id === id,
      ))
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    opcionesPiso: [...pisosMap.entries()]
      .filter(([id, piso]) =>
        (!filtros.pabellonId || piso.pabellonId === filtros.pabellonId) &&
        ambientes.some((ambiente) => ambiente.activo && ambiente.pisos.id === id),
      )
      .map(([id, piso]) => ({ id, nombre: piso.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    opcionesAmbiente: ambientesFiltrados
      .filter((ambiente) =>
        ambiente.activo && (!filtros.pisoId || ambiente.pisos.id === filtros.pisoId),
      )
      .map(({ id, codigo, nombre }) => ({ id, codigo, nombre }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo)),
    mantenimientos,
  }
}
