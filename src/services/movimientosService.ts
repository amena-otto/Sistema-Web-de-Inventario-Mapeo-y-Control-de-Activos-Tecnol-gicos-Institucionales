import { supabase } from './supabaseClient'
import type { AmbienteUbicacion } from './ubicacionesService'

export type AmbienteMovimiento = AmbienteUbicacion & {
  pabellon: string
  piso: string
}

export type EquipoMovimiento = {
  id: string
  codigo_institucional: string
  nombre: string
  ambiente_id: string | null
  responsable_id: string | null
  posicion: string | null
}

export type EquipoFiltroMovimiento = Pick<
  EquipoMovimiento,
  'id' | 'codigo_institucional' | 'nombre'
>

export type ResponsableMovimiento = {
  id: string
  nombres: string
  apellidos: string
  rol: string
  activo: boolean
}

export type Movimiento = {
  id: string
  equipo_id: string
  codigo_institucional: string
  equipo_nombre: string
  ambiente_origen_id: string | null
  ubicacion_origen: string | null
  ambiente_destino_id: string | null
  ubicacion_destino: string | null
  responsable_anterior_id: string | null
  responsable_anterior: string | null
  responsable_nuevo_id: string | null
  responsable_nuevo: string | null
  posicion_anterior: string | null
  posicion_nueva: string | null
  responsable_id: string | null
  actor: string | null
  fecha_movimiento: string
  motivo: string
  created_at: string
  total: number
}

export type FiltrosMovimiento = {
  equipoId: string
  desde: string
  hasta: string
  pagina: number
  porPagina: number
}

export type NuevoMovimiento = {
  equipoId: string
  ambienteDestinoId: string | null
  responsableNuevoId: string | null
  posicionNueva: string | null
  fecha: string
  motivo: string
}

export async function listarEquiposMovimiento(): Promise<EquipoMovimiento[]> {
  const { data, error } = await supabase
    .from('equipos')
    .select('id, codigo_institucional, nombre, ambiente_id, responsable_id, posicion')
    .eq('situacion', 'activo')
    .order('codigo_institucional')
  if (error) throw error
  return (data ?? []) as EquipoMovimiento[]
}

export async function listarEquiposHistorialMovimiento(): Promise<EquipoFiltroMovimiento[]> {
  const { data, error } = await supabase
    .from('equipos')
    .select('id, codigo_institucional, nombre')
    .order('codigo_institucional')
  if (error) throw error
  return (data ?? []) as EquipoFiltroMovimiento[]
}

export async function listarAmbientesMovimiento(): Promise<AmbienteMovimiento[]> {
  const { data, error } = await supabase
    .from('ambientes')
    .select(
      'id, piso_id, codigo, nombre, tipo, descripcion, activo, pisos!inner(nombre, pabellones!inner(nombre))',
    )
    .eq('activo', true)
    .order('codigo')
  if (error) throw error

  return (data ?? []).map((item) => {
    const fila = item as unknown as {
      id: string
      piso_id: string
      codigo: string
      nombre: string
      tipo: string
      descripcion: string | null
      activo: boolean
      pisos: { nombre: string; pabellones: { nombre: string } }
    }
    return {
      id: fila.id,
      piso_id: fila.piso_id,
      codigo: fila.codigo,
      nombre: fila.nombre,
      tipo: fila.tipo,
      descripcion: fila.descripcion,
      activo: fila.activo,
      piso: fila.pisos.nombre,
      pabellon: fila.pisos.pabellones.nombre,
    }
  })
}

export async function listarResponsablesMovimiento(): Promise<ResponsableMovimiento[]> {
  const { data, error } = await supabase.rpc('listar_responsables_movimiento')
  if (error) throw error
  return (data ?? []) as ResponsableMovimiento[]
}

export async function listarHistorialMovimientos(filtros: FiltrosMovimiento) {
  const { data, error } = await supabase.rpc('listar_movimientos', {
    p_equipo_id: filtros.equipoId || null,
    p_desde: filtros.desde || null,
    p_hasta: filtros.hasta || null,
    p_limite: filtros.porPagina,
    p_offset: (filtros.pagina - 1) * filtros.porPagina,
  })
  if (error) throw error

  const movimientos = (data ?? []) as Movimiento[]
  return {
    movimientos,
    total: Number(movimientos[0]?.total ?? 0),
  }
}

export async function registrarMovimiento(datos: NuevoMovimiento) {
  const { data, error } = await supabase.rpc('registrar_movimiento', {
    p_equipo_id: datos.equipoId,
    p_ambiente_destino_id: datos.ambienteDestinoId,
    p_responsable_nuevo_id: datos.responsableNuevoId,
    p_fecha_movimiento: datos.fecha,
    p_motivo: datos.motivo.trim(),
    p_posicion_nueva: datos.posicionNueva,
  })
  if (error) throw error
  return data as string
}

export function etiquetaUbicacion(
  ambienteId: string | null,
  ambientes: AmbienteMovimiento[],
) {
  if (!ambienteId) return 'Sin ubicación'
  const ambiente = ambientes.find((item) => item.id === ambienteId)
  return ambiente
    ? `${ambiente.pabellon} / ${ambiente.piso} / ${ambiente.codigo} — ${ambiente.nombre}`
    : 'Ubicación no disponible'
}
