import { supabase } from './supabaseClient'
import type { EstadoOperativo } from './equiposService'

export const estadosMantenimiento = [
  'pendiente',
  'en_proceso',
  'completado',
] as const

export type EstadoMantenimiento = (typeof estadosMantenimiento)[number]
export type TipoMantenimiento = 'preventivo' | 'correctivo'

export const estadosOperativosFinales = [
  'operativo',
  'con_fallas',
  'inoperativo',
] as const

export type EstadoOperativoFinal = (typeof estadosOperativosFinales)[number]

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

export type AvanceMantenimiento = {
  id: string
  mantenimiento_id: string
  equipo_id: string
  fecha_hora: string
  registrado_por: string | null
  descripcion: string
  observaciones: string | null
  diagnostico: string | null
  acciones_realizadas: string | null
  componentes_reemplazados: string | null
  proximo_seguimiento: string | null
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
  proximo_seguimiento: string | null
  estado: EstadoMantenimiento
  estado_operativo_anterior: EstadoOperativo | null
  fecha_inicio_real: string | null
  fecha_finalizacion_real: string | null
  iniciado_por: { nombres: string; apellidos: string } | null
  finalizado_por: { nombres: string; apellidos: string } | null
  responsable_id: string | null
  created_at: string
  equipo: {
    id: string
    codigo_institucional: string
    nombre: string
    estado_operativo: EstadoOperativo
  } | null
  responsable: { nombres: string; apellidos: string } | null
  cambios: CambioEstadoMantenimiento[]
  avances: AvanceMantenimiento[]
}

export type EquipoMantenimiento = {
  id: string
  codigo_institucional: string
  nombre: string
  numero_serie: string | null
  categoria_nombre: string | null
  ubicacion: string | null
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
  observaciones: string
  proximaRevision: string
  responsableId: string
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
  responsableId: string
}

export type DatosAvanceMantenimiento = {
  mantenimientoId: string
  descripcion: string
  observaciones: string
  diagnostico: string
  acciones: string
  componentes: string
  proximoSeguimiento: string
  actualizarSeguimiento: boolean
}

export type DatosCierreMantenimiento = {
  mantenimientoId: string
  diagnostico: string
  acciones: string
  resultado: string
  estadoOperativoFinal: EstadoOperativoFinal
  componentes: string
  observacionesFinales: string
  proximaRevision: string
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
  proximo_seguimiento: string | null
  estado: EstadoMantenimiento
  estado_operativo_anterior: EstadoOperativo | null
  fecha_inicio_real: string | null
  fecha_finalizacion_real: string | null
  iniciado_por: string | null
  finalizado_por: string | null
  responsable_id: string | null
  created_at: string
  equipos: EquipoEmbebido | EquipoEmbebido[] | null
}

type CambioEstadoBase = Omit<CambioEstadoMantenimiento, 'usuario'>
type AvanceBase = Omit<AvanceMantenimiento, 'usuario'>

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
  'proximo_seguimiento',
  'estado',
  'estado_operativo_anterior',
  'fecha_inicio_real',
  'fecha_finalizacion_real',
  'iniciado_por',
  'finalizado_por',
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

const camposAvance = [
  'id',
  'mantenimiento_id',
  'equipo_id',
  'fecha_hora',
  'registrado_por',
  'descripcion',
  'observaciones',
  'diagnostico',
  'acciones_realizadas',
  'componentes_reemplazados',
  'proximo_seguimiento',
].join(', ')

/** Catálogo simple usado por los filtros del historial. */
export async function listarEquiposMantenimiento(): Promise<EquipoMantenimiento[]> {
  const { data, error } = await supabase
    .from('equipos')
    .select('id, codigo_institucional, nombre, estado_operativo')
    .eq('situacion', 'activo')
    .order('codigo_institucional')
  if (error) throw error
  return ((data ?? []) as Pick<
    EquipoMantenimiento,
    'id' | 'codigo_institucional' | 'nombre' | 'estado_operativo'
  >[]).map((equipo) => ({
    ...equipo,
    numero_serie: null,
    categoria_nombre: null,
    ubicacion: null,
  }))
}

/**
 * Búsqueda escrita, paginada y bajo demanda para el formulario de registro.
 * El normalizador de la RPC ignora mayúsculas y tildes y admite coincidencias
 * parciales en código, nombre, serie, categoría y ubicación.
 */
export async function buscarEquiposMantenimiento(
  termino: string,
  offset = 0,
  limite = 20,
): Promise<{ equipos: EquipoMantenimiento[]; total: number }> {
  const { data, error } = await supabase.rpc('buscar_equipos_mantenimiento', {
    p_termino: termino,
    p_limite: limite,
    p_offset: offset,
  })
  if (error) throw error
  const filas = (data ?? []) as (EquipoMantenimiento & { total: number })[]
  return {
    equipos: filas.map((fila) => ({
      id: fila.id,
      codigo_institucional: fila.codigo_institucional,
      nombre: fila.nombre,
      numero_serie: fila.numero_serie,
      categoria_nombre: fila.categoria_nombre,
      ubicacion: fila.ubicacion,
      estado_operativo: fila.estado_operativo,
    })),
    total: Number(filas[0]?.total ?? 0),
  }
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

  const [cambiosResultado, avancesResultado] = await Promise.all([
    mantenimientoIds.length
      ? supabase
          .from('mantenimiento_cambios_estado')
          .select(camposCambio)
          .in('mantenimiento_id', mantenimientoIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as CambioEstadoBase[], error: null }),
    mantenimientoIds.length
      ? supabase
          .from('mantenimiento_avances')
          .select(camposAvance)
          .in('mantenimiento_id', mantenimientoIds)
          .order('fecha_hora', { ascending: true })
      : Promise.resolve({ data: [] as AvanceBase[], error: null }),
  ])
  if (cambiosResultado.error) throw cambiosResultado.error
  if (avancesResultado.error) throw avancesResultado.error

  const cambios = (cambiosResultado.data ?? []) as CambioEstadoBase[]
  const avances = (avancesResultado.data ?? []) as AvanceBase[]

  const perfilesIds = new Set<string>()
  for (const item of registros) {
    if (item.responsable_id) perfilesIds.add(item.responsable_id)
    if (item.iniciado_por) perfilesIds.add(item.iniciado_por)
    if (item.finalizado_por) perfilesIds.add(item.finalizado_por)
  }
  for (const cambio of cambios) {
    if (cambio.usuario_id) perfilesIds.add(cambio.usuario_id)
  }
  for (const avance of avances) {
    if (avance.registrado_por) perfilesIds.add(avance.registrado_por)
  }

  const tecnicos = perfilesIds.size ? await listarTecnicosMantenimiento() : []
  const perfilesPorId = new Map(tecnicos.map((item) => [item.id, item]))
  const perfil = (id: string | null) => {
    const item = id ? perfilesPorId.get(id) ?? null : null
    return item
      ? { nombres: item.nombres, apellidos: item.apellidos }
      : null
  }

  const cambiosPorMantenimiento = new Map<string, CambioEstadoMantenimiento[]>()
  for (const cambio of cambios) {
    const registro: CambioEstadoMantenimiento = {
      ...cambio,
      usuario: perfil(cambio.usuario_id),
    }
    const lista = cambiosPorMantenimiento.get(cambio.mantenimiento_id) ?? []
    lista.push(registro)
    cambiosPorMantenimiento.set(cambio.mantenimiento_id, lista)
  }

  const avancesPorMantenimiento = new Map<string, AvanceMantenimiento[]>()
  for (const avance of avances) {
    const registro: AvanceMantenimiento = {
      ...avance,
      usuario: perfil(avance.registrado_por),
    }
    const lista = avancesPorMantenimiento.get(avance.mantenimiento_id) ?? []
    lista.push(registro)
    avancesPorMantenimiento.set(avance.mantenimiento_id, lista)
  }

  return {
    mantenimientos: registros.map((item) => {
      const equipo = Array.isArray(item.equipos)
        ? item.equipos[0] ?? null
        : item.equipos
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
        proximo_seguimiento: item.proximo_seguimiento,
        estado: item.estado,
        estado_operativo_anterior: item.estado_operativo_anterior,
        fecha_inicio_real: item.fecha_inicio_real,
        fecha_finalizacion_real: item.fecha_finalizacion_real,
        iniciado_por: perfil(item.iniciado_por),
        finalizado_por: perfil(item.finalizado_por),
        responsable_id: item.responsable_id,
        created_at: item.created_at,
        equipo,
        responsable: perfil(item.responsable_id),
        cambios: cambiosPorMantenimiento.get(item.id) ?? [],
        avances: avancesPorMantenimiento.get(item.id) ?? [],
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

/** Alta siempre pendiente; el estado operativo del equipo no se toca. */
export async function registrarMantenimiento(datos: NuevoMantenimiento) {
  const { data, error } = await supabase.rpc('registrar_mantenimiento', {
    p_equipo_id: datos.equipoId,
    p_tipo: datos.tipo,
    p_fecha_mantenimiento: datos.fecha,
    p_problema_reportado: datos.problema.trim(),
    p_diagnostico: null,
    p_acciones_realizadas: null,
    p_componentes_reemplazados: null,
    p_resultado: null,
    p_observaciones: datos.observaciones || null,
    p_proxima_revision: datos.proximaRevision || null,
    p_estado: 'pendiente',
    p_estado_equipo: null,
    p_responsable_id: datos.responsableId || null,
    p_motivo_estado: null,
  })
  if (error) throw error
  return data as string
}

/** Edición ordinaria: no cambia estados ni el estado operativo del equipo. */
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
    p_estado_equipo: null,
    p_motivo: null,
    p_responsable_id: datos.responsableId || null,
  })
  if (error) throw error
  return data as string
}

/** Transición atómica pendiente → en_proceso + equipo a en_mantenimiento. */
export async function iniciarMantenimiento(
  mantenimientoId: string,
  observaciones = '',
) {
  const { data, error } = await supabase.rpc('iniciar_mantenimiento', {
    p_mantenimiento_id: mantenimientoId,
    p_observaciones: observaciones || null,
  })
  if (error) throw error
  return data as string
}

/** Registro cronológico e inmutable dentro de la misma intervención. */
export async function guardarAvanceMantenimiento(datos: DatosAvanceMantenimiento) {
  const { data, error } = await supabase.rpc('guardar_avance_mantenimiento', {
    p_mantenimiento_id: datos.mantenimientoId,
    p_descripcion: datos.descripcion.trim(),
    p_observaciones: datos.observaciones || null,
    p_diagnostico: datos.diagnostico || null,
    p_acciones: datos.acciones || null,
    p_componentes: datos.componentes || null,
    p_proximo_seguimiento: datos.actualizarSeguimiento
      ? datos.proximoSeguimiento || null
      : null,
    p_actualizar_seguimiento: datos.actualizarSeguimiento,
  })
  if (error) throw error
  return data as string
}

/** Transición atómica en_proceso → completado con estado operativo elegido. */
export async function finalizarMantenimiento(datos: DatosCierreMantenimiento) {
  const { data, error } = await supabase.rpc('finalizar_mantenimiento', {
    p_mantenimiento_id: datos.mantenimientoId,
    p_diagnostico: datos.diagnostico.trim(),
    p_acciones: datos.acciones.trim(),
    p_resultado: datos.resultado.trim(),
    p_estado_operativo_final: datos.estadoOperativoFinal,
    p_componentes: datos.componentes || null,
    p_observaciones_finales: datos.observacionesFinales || null,
    p_proxima_revision: datos.proximaRevision || null,
  })
  if (error) throw error
  return data as string
}
