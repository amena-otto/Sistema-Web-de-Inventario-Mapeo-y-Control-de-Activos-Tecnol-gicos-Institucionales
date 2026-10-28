import { supabase } from './supabaseClient'
import type { EstadoOperativo } from './equiposService'

export const estadosMantenimiento = [
  'pendiente',
  'en_proceso',
  'completado',
] as const

export type EstadoMantenimiento = (typeof estadosMantenimiento)[number]
export type TipoMantenimiento = 'preventivo' | 'correctivo'

export type CambioEstadoMantenimiento = {
  id: string
  mantenimiento_id: string
  equipo_id: string
  estado_mantenimiento_anterior: EstadoMantenimiento | null
  estado_mantenimiento_nuevo: EstadoMantenimiento
  estado_equipo_anterior: EstadoOperativo | null
  estado_equipo_nuevo: EstadoOperativo | null
  motivo: string | null
  usuario_id: string | null
  created_at: string
  usuario: { nombres: string; apellidos: string } | null
}

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
  cambios: CambioEstadoMantenimiento[]
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
  tipo: string
  estadoEquipo: string
  desde: string
  hasta: string
  revisionVencida: boolean
  ordenReciente: boolean
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
  responsableId: string
  motivoEstado: string
}

export type ActualizacionMantenimiento = {
  id: string
  estado: EstadoMantenimiento
  problema: string
  diagnostico: string
  acciones: string
  componentes: string
  resultado: string
  observaciones: string
  proximaRevision: string
  estadoEquipo: EstadoOperativo | ''
  motivoEstado: string
  responsableId: string
}

type EquipoEmbebido = {
  id: string
  codigo_institucional: string
  nombre: string
  estado_operativo: EstadoOperativo
}

type FilaMantenimiento = {
  id: string
  equipo_id: string
  tipo: TipoMantenimiento
  fecha_mantenimiento: string
  descripcion: string | null
  problema_reportado: string | null
  diagnostico: string | null
  acciones_realizadas: string | null
  componentes_reemplazados: string | null
  resultado: string | null
  observaciones: string | null
  proxima_revision: string | null
  estado: EstadoMantenimiento
  responsable_id: string | null
  created_at: string
  equipos: EquipoEmbebido | EquipoEmbebido[] | null
}

type CambioEstadoBase = Omit<CambioEstadoMantenimiento, 'usuario'>

const camposMantenimiento = [
  'id',
  'equipo_id',
  'tipo',
  'fecha_mantenimiento',
  'descripcion',
  'problema_reportado',
  'diagnostico',
  'acciones_realizadas',
  'componentes_reemplazados',
  'resultado',
  'observaciones',
  'proxima_revision',
  'estado',
  'responsable_id',
  'created_at',
].join(', ')

const camposCambio = [
  'id',
  'mantenimiento_id',
  'equipo_id',
  'estado_mantenimiento_anterior',
  'estado_mantenimiento_nuevo',
  'estado_equipo_anterior',
  'estado_equipo_nuevo',
  'motivo',
  'usuario_id',
  'created_at',
].join(', ')

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
      `${camposMantenimiento}, equipos!inner(id, codigo_institucional, nombre, estado_operativo)`,
      { count: 'exact' },
    )
    .order(
      filtros.ordenReciente ? 'created_at' : 'fecha_mantenimiento',
      { ascending: false },
    )
    .order(filtros.ordenReciente ? 'fecha_mantenimiento' : 'created_at', {
      ascending: false,
    })
    .range(
      (filtros.pagina - 1) * filtros.porPagina,
      filtros.pagina * filtros.porPagina - 1,
    )

  if (filtros.equipoId) query = query.eq('equipo_id', filtros.equipoId)
  if (filtros.responsableId) query = query.eq('responsable_id', filtros.responsableId)
  if (filtros.estado) query = query.eq('estado', filtros.estado)
  if (filtros.tipo) query = query.eq('tipo', filtros.tipo)
  if (filtros.estadoEquipo) {
    query = query.eq('equipos.estado_operativo', filtros.estadoEquipo)
  }
  if (filtros.desde) query = query.gte('fecha_mantenimiento', filtros.desde)
  if (filtros.hasta) query = query.lte('fecha_mantenimiento', filtros.hasta)

  if (filtros.revisionVencida) {
    const { data: vencidos, error: errorVencidos } = await supabase.rpc(
      'equipos_revision_vencida',
    )
    if (errorVencidos) throw errorVencidos
    const ids = (vencidos ?? []).map(
      (item: { equipo_id: string }) => item.equipo_id,
    )
    if (!ids.length) return { mantenimientos: [], total: 0 }
    query = query.in('equipo_id', ids)
  }

  const { data, error, count } = await query
  if (error) throw error

  const registros = (data ?? []) as unknown as FilaMantenimiento[]
  const mantenimientoIds = registros.map((item) => item.id)

  const cambiosResultado = mantenimientoIds.length
    ? await supabase
        .from('mantenimiento_cambios_estado')
        .select(camposCambio)
        .in('mantenimiento_id', mantenimientoIds)
        .order('created_at', { ascending: true })
    : { data: [] as CambioEstadoBase[], error: null }
  if (cambiosResultado.error) throw cambiosResultado.error
  const cambios = (cambiosResultado.data ?? []) as CambioEstadoBase[]

  const perfilesIds = new Set<string>()
  for (const item of registros) {
    if (item.responsable_id) perfilesIds.add(item.responsable_id)
  }
  for (const cambio of cambios) {
    if (cambio.usuario_id) perfilesIds.add(cambio.usuario_id)
  }

  const tecnicos = perfilesIds.size ? await listarTecnicosMantenimiento() : []
  const perfilesPorId = new Map(tecnicos.map((item) => [item.id, item]))

  const cambiosPorMantenimiento = new Map<string, CambioEstadoMantenimiento[]>()
  for (const cambio of cambios) {
    const perfil = cambio.usuario_id
      ? perfilesPorId.get(cambio.usuario_id) ?? null
      : null
    const registro: CambioEstadoMantenimiento = {
      ...cambio,
      usuario: perfil
        ? { nombres: perfil.nombres, apellidos: perfil.apellidos }
        : null,
    }
    const lista = cambiosPorMantenimiento.get(cambio.mantenimiento_id) ?? []
    lista.push(registro)
    cambiosPorMantenimiento.set(cambio.mantenimiento_id, lista)
  }

  return {
    mantenimientos: registros.map((item) => {
      const equipo = Array.isArray(item.equipos)
        ? item.equipos[0] ?? null
        : item.equipos
      const perfil = item.responsable_id
        ? perfilesPorId.get(item.responsable_id) ?? null
        : null
      return {
        id: item.id,
        equipo_id: item.equipo_id,
        tipo: item.tipo,
        fecha_mantenimiento: item.fecha_mantenimiento,
        descripcion: item.descripcion,
        problema_reportado: item.problema_reportado ?? item.descripcion ?? '',
        diagnostico: item.diagnostico,
        acciones_realizadas: item.acciones_realizadas,
        componentes_reemplazados: item.componentes_reemplazados,
        resultado: item.resultado,
        observaciones: item.observaciones,
        proxima_revision: item.proxima_revision,
        estado: item.estado,
        responsable_id: item.responsable_id,
        created_at: item.created_at,
        equipo,
        responsable: perfil
          ? { nombres: perfil.nombres, apellidos: perfil.apellidos }
          : null,
        cambios: cambiosPorMantenimiento.get(item.id) ?? [],
      }
    }) as Mantenimiento[],
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
    p_diagnostico: datos.diagnostico || null,
    p_acciones_realizadas: datos.acciones || null,
    p_componentes_reemplazados: datos.componentes || null,
    p_resultado: datos.resultado || null,
    p_observaciones: datos.observaciones || null,
    p_proxima_revision: datos.proximaRevision || null,
    p_estado: 'pendiente',
    p_estado_equipo: datos.estadoEquipo || null,
    p_responsable_id: datos.responsableId || null,
    p_motivo_estado: datos.motivoEstado || null,
  })
  if (error) throw error
  return data as string
}

export async function actualizarMantenimiento(datos: ActualizacionMantenimiento) {
  const { data, error } = await supabase.rpc('actualizar_mantenimiento', {
    p_id: datos.id,
    p_estado: datos.estado,
    p_problema_reportado: datos.problema.trim(),
    p_diagnostico: datos.diagnostico || null,
    p_acciones_realizadas: datos.acciones || null,
    p_componentes_reemplazados: datos.componentes || null,
    p_resultado: datos.resultado || null,
    p_observaciones: datos.observaciones || null,
    p_proxima_revision: datos.proximaRevision || null,
    p_estado_equipo: datos.estadoEquipo || null,
    p_motivo: datos.motivoEstado || null,
    p_responsable_id: datos.responsableId || null,
  })
  if (error) throw error
  return data as string
}
