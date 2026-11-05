import { supabase } from './supabaseClient'
import {
  cargarEquiposDeAmbientes,
  registrarErrorSupabase,
  type EquipoUbicacion,
  type FilaEquipoPiso,
  type RespuestaEquiposPiso,
} from '../utils/equiposPiso'

export type { EquipoUbicacion } from '../utils/equiposPiso'

export type Pabellon = {
  id: string
  nombre: string
  descripcion: string | null
  activo: boolean
}

export type Piso = {
  id: string
  pabellon_id: string
  nombre: string
  numero: number | null
  activo: boolean
}

export type AmbienteUbicacion = {
  id: string
  piso_id: string
  codigo: string
  nombre: string
  tipo: string
  descripcion: string | null
  activo: boolean
}

export async function listarPabellones(): Promise<Pabellon[]> {
  const { data, error } = await supabase
    .from('pabellones')
    .select('id, nombre, descripcion, activo')
    .order('nombre')
  if (error) throw error
  return data as Pabellon[]
}

export async function listarPisos(): Promise<Piso[]> {
  const { data, error } = await supabase
    .from('pisos')
    .select('id, pabellon_id, nombre, numero, activo')
    .order('numero')
  if (error) throw error
  return data as Piso[]
}

export async function listarAmbientes(): Promise<AmbienteUbicacion[]> {
  const { data, error } = await supabase
    .from('ambientes')
    .select('id, piso_id, codigo, nombre, tipo, descripcion, activo')
    .order('codigo')
  if (error) throw error
  return data as AmbienteUbicacion[]
}

export async function guardarPabellon(
  datos: Pick<Pabellon, 'nombre' | 'descripcion' | 'activo'>,
  id?: string,
) {
  const consulta = id
    ? supabase.from('pabellones').update(datos).eq('id', id)
    : supabase.from('pabellones').insert(datos)
  const { data, error } = await consulta
    .select('id, nombre, descripcion, activo')
    .single()
  if (error) throw error
  return data as Pabellon
}

export async function guardarPiso(
  datos: Pick<Piso, 'pabellon_id' | 'nombre' | 'numero' | 'activo'>,
  id?: string,
) {
  const consulta = id
    ? supabase.from('pisos').update(datos).eq('id', id)
    : supabase.from('pisos').insert(datos)
  const { data, error } = await consulta
    .select('id, pabellon_id, nombre, numero, activo')
    .single()
  if (error) throw error
  return data as Piso
}

export async function guardarAmbiente(
  datos: Pick<
    AmbienteUbicacion,
    'piso_id' | 'codigo' | 'nombre' | 'tipo' | 'descripcion' | 'activo'
  >,
  id?: string,
) {
  const consulta = id
    ? supabase.from('ambientes').update(datos).eq('id', id)
    : supabase.from('ambientes').insert(datos)
  const { data, error } = await consulta
    .select('id, piso_id, codigo, nombre, tipo, descripcion, activo')
    .single()
  if (error) throw error
  return data as AmbienteUbicacion
}

export async function eliminarPabellon(id: string) {
  const { count, error: consultaError } = await supabase
    .from('pisos')
    .select('id', { count: 'exact', head: true })
    .eq('pabellon_id', id)
  if (consultaError) throw consultaError
  if (count) {
    throw new Error('No se puede eliminar: primero elimina o mueve sus pisos.')
  }

  const { error } = await supabase.from('pabellones').delete().eq('id', id)
  if (error) throw error
}

export async function eliminarPiso(id: string) {
  const { count, error: consultaError } = await supabase
    .from('ambientes')
    .select('id', { count: 'exact', head: true })
    .eq('piso_id', id)
  if (consultaError) throw consultaError
  if (count) {
    throw new Error('No se puede eliminar: primero elimina o mueve sus ambientes.')
  }

  const { error } = await supabase.from('pisos').delete().eq('id', id)
  if (error) throw error
}

export async function eliminarAmbiente(id: string) {
  const { count, error: consultaError } = await supabase
    .from('equipos')
    .select('id', { count: 'exact', head: true })
    .eq('ambiente_id', id)
  if (consultaError) throw consultaError
  if (count) {
    throw new Error('No se puede eliminar: primero reasigna los equipos de este ambiente.')
  }

  const { error } = await supabase.from('ambientes').delete().eq('id', id)
  if (error) throw error
}

export async function listarEquiposPiso(
  ambienteIds: string[],
): Promise<EquipoUbicacion[]> {
  if (!ambienteIds.length) return []

  const { data: categoriasData, error: categoriasError } = await supabase
    .from('categorias_equipos')
    .select('id, nombre')
  if (categoriasError) {
    registrarErrorSupabase(
      'No se pudieron cargar las categorías para los equipos del piso',
      categoriasError,
    )
  }

  const categorias = new Map<string, string>(
    (categoriasData ?? []).map((categoria) => [
      String(categoria.id),
      String(categoria.nombre),
    ]),
  )

  return cargarEquiposDeAmbientes(
    ambienteIds,
    async (ids): Promise<RespuestaEquiposPiso> => {
      const { data, error } = await supabase
        .from('equipos')
        .select(
          'id, codigo_institucional, nombre, marca, modelo, numero_serie, estado_operativo, situacion, ambiente_id, categoria_id',
        )
        .in('ambiente_id', ids)
        .eq('situacion', 'activo')
        .order('codigo_institucional')

      return { data: data as FilaEquipoPiso[] | null, error }
    },
    categorias,
  )
}
