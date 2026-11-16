import { supabase } from './supabaseClient'
import type { EquipoUbicacion } from '../utils/equiposPiso'

export type AreaUsuaria = { ambiente_id: string; ambiente: { nombre: string; activo: boolean } }
export async function listarAreasEquipo(equipoId: string): Promise<AreaUsuaria[]> {
  const { data, error } = await supabase.from('equipo_areas_usuarias')
    .select('ambiente_id, ambiente:ambientes!inner(nombre, activo)').eq('equipo_id', equipoId).order('created_at')
  if (error) throw error
  return (data ?? []) as unknown as AreaUsuaria[]
}
export async function guardarAreasEquipo(equipoId: string, areas: string[], anteriores: string[]) {
  const { error } = await supabase.rpc('configurar_areas_equipo', {
    p_equipo_id: equipoId, p_areas: areas, p_areas_anteriores: anteriores,
  })
  if (error) throw error
}
export async function listarEquiposCompartidos(ambienteId: string): Promise<EquipoUbicacion[]> {
  const equipos: EquipoUbicacion[] = []
  for (let inicio = 0; ; inicio += 200) {
    const { data, error } = await supabase.from('equipo_areas_usuarias')
      .select('equipo:equipos!inner(id, codigo_institucional, nombre, marca, modelo, numero_serie, estado_operativo, situacion, ambiente_id, categoria_id, categoria:categorias_equipos(nombre))')
      .eq('ambiente_id', ambienteId).eq('equipo.situacion', 'activo').order('id').range(inicio, inicio + 199)
    if (error) throw error
    const filas = (data ?? []) as unknown as { equipo: EquipoUbicacion }[]
    equipos.push(...filas.map((f) => f.equipo))
    if (filas.length < 200) return equipos
  }
}
export function mensajeCompartidos(error: unknown) {
  const e = error as { code?: string; message?: string }
  if (['42P01', 'PGRST205', 'PGRST202'].includes(e?.code ?? '')) {
    return 'Uso compartido aún no está habilitado en esta base. Falta aplicar la migración 020.'
  }
  return e?.message || 'No se pudo consultar el uso compartido. Inténtalo nuevamente.'
}

export async function listarUsoEquipos(ids: string[]): Promise<Record<string, string[]>> {
  if (!ids.length) return {}
  const uso: Record<string, string[]> = {}
  for (let inicio = 0; ; inicio += 200) {
    const { data, error } = await supabase.from('equipo_areas_usuarias').select('equipo_id, ambiente_id').in('equipo_id', ids).order('id').range(inicio, inicio+199)
    if (error) throw error
    for (const fila of data ?? []) (uso[fila.equipo_id] ??= []).push(fila.ambiente_id)
    if (!data || data.length < 200) return uso
  }
}
