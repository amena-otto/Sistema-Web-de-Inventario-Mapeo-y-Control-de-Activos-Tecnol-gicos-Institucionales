import { supabase } from './supabaseClient'
import type { EstadoOperativo } from './equiposService'

export const estadosMantenimiento = [
  'pendiente',
  'en_proceso',
  'completado',
] as const

export type EstadoMantenimiento = (typeof estadosMantenimiento)[number]
export type TipoMantenimiento = 'preventivo' | 'correctivo'

export type Mantenimiento = {
  id: string
  equipo_id: string
  tipo: TipoMantenimiento
  fecha_mantenimiento: string
  descripcion: string | null
  problema_reportado: string
  diagnostico: string | null
  acciones_realizadas: string | null
  componentes_reemplazados: string | null
  resultado: string | null
  observaciones: string | null
  proxima_revision: string | null
  estado: EstadoMantenimiento
  responsable_id: string | null
  created_at: string
  equipo: {
    codigo_institucional: string
    nombre: string
    estado_operativo: EstadoOperativo
  } | null
  responsable: { nombres: string; apellidos: string } | null
}

export type EquipoMantenimiento = {
  id: string
  codigo_institucional: string
  nombre: string
  estado_operativo: EstadoOperativo
}

export type TecnicoMantenimiento = {
  id: string
  nombres: string
  apellidos: string
  activo: boolean
}

export type FiltrosMantenimiento = {
  equipoId: string
  responsableId: string
  estado: string
  desde: string
  hasta: string
  pagina: number
  porPagina: number
}

export type NuevoMantenimiento = {
  equipoId: string
  tipo: TipoMantenimiento
  fecha: string
  problema: string
  diagnostico: string
  acciones: string
  componentes: string
  resultado: string
  observaciones: string
  proximaRevision: string
  estado: EstadoMantenimiento
  estadoEquipo: EstadoOperativo | ''
}

export async function listarEquiposMantenimiento(): Promise<EquipoMantenimiento[]> {
  const { data, error } = await supabase
    .from('equipos')
    .select('id, codigo_institucional, nombre, estado_operativo')
    .eq('situacion', 'activo')
    .order('codigo_institucional')
  if (error) throw error
  return (data ?? []) as EquipoMantenimiento[]
}

export async function listarMantenimientos(filtros: FiltrosMantenimiento) {
  let query = supabase
    .from('mantenimientos')
    .select(
      'id, equipo_id, tipo, fecha_mantenimiento, descripcion, problema_reportado, diagnostico, acciones_realizadas, componentes_reemplazados, resultado, observaciones, proxima_revision, estado, responsable_id, created_at',
      { count: 'exact' },
    )
    .order('fecha_mantenimiento', { ascending: false })
    .order('created_at', { ascending: false })
    .range(
      (filtros.pagina - 1) * filtros.porPagina,
      filtros.pagina * filtros.porPagina - 1,
    )

  if (filtros.equipoId) query = query.eq('equipo_id', filtros.equipoId)
  if (filtros.responsableId) query = query.eq('responsable_id', filtros.responsableId)
  if (filtros.estado) query = query.eq('estado', filtros.estado)
  if (filtros.desde) query = query.gte('fecha_mantenimiento', filtros.desde)
  if (filtros.hasta) query = query.lte('fecha_mantenimiento', filtros.hasta)

  const { data, error, count } = await query
  if (error) throw error

  const registros = data ?? []
  const equipoIds = [...new Set(registros.map((item) => item.equipo_id))]
  const responsableIds = [
    ...new Set(
      registros
        .map((item) => item.responsable_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]

  const [equiposResult, tecnicos] = await Promise.all([
    equipoIds.length
      ? supabase
          .from('equipos')
          .select('id, codigo_institucional, nombre, estado_operativo')
          .in('id', equipoIds)
      : Promise.resolve({ data: [], error: null }),
    responsableIds.length
      ? listarTecnicosMantenimiento()
      : Promise.resolve([] as TecnicoMantenimiento[]),
  ])
  if (equiposResult.error) throw equiposResult.error

  const equiposPorId = new Map(
    (equiposResult.data ?? []).map((item) => [item.id, item]),
  )
  const perfilesPorId = new Map(
    tecnicos.map((item) => [item.id, item]),
  )

  return {
    mantenimientos: registros.map((item) => ({
      ...item,
      problema_reportado: item.problema_reportado ?? item.descripcion ?? '',
      equipo: equiposPorId.get(item.equipo_id) ?? null,
      responsable: item.responsable_id
        ? perfilesPorId.get(item.responsable_id) ?? null
        : null,
    })) as Mantenimiento[],
    total: count ?? 0,
  }
}

export async function listarTecnicosMantenimiento() {
  const { data, error } = await supabase.rpc('listar_tecnicos_mantenimiento')
  if (error) throw error
  return (data ?? []) as TecnicoMantenimiento[]
}

export async function obtenerIndicadoresMantenimiento() {
  const { data, error } = await supabase.rpc('indicadores_mantenimiento')
  if (error) throw error
  const valores = data?.[0]
  return {
    pendientes: Number(valores?.equipos_pendientes ?? 0),
    enProceso: Number(valores?.equipos_en_proceso ?? 0),
    vencidos: Number(valores?.equipos_revision_vencida ?? 0),
    mes: Number(valores?.intervenciones_mes ?? 0),
  }
}

export async function registrarMantenimiento(datos: NuevoMantenimiento) {
  const { data, error } = await supabase.rpc('registrar_mantenimiento', {
    p_equipo_id: datos.equipoId,
    p_tipo: datos.tipo,
    p_fecha_mantenimiento: datos.fecha,
    p_problema_reportado: datos.problema.trim(),
    p_diagnostico: datos.diagnostico,
    p_acciones_realizadas: datos.acciones,
    p_componentes_reemplazados: datos.componentes,
    p_resultado: datos.resultado,
    p_observaciones: datos.observaciones,
    p_proxima_revision: datos.proximaRevision || null,
    p_estado: datos.estado,
    p_estado_equipo: datos.estadoEquipo || null,
  })
  if (error) throw error
  return data as string
}
