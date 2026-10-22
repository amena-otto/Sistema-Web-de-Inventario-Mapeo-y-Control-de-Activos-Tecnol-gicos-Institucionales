import { supabase } from './supabaseClient'

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
  plano_storage_path: string | null
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

export type EquipoUbicacion = {
  id: string
  codigo_institucional: string
  nombre: string
  marca: string | null
  modelo: string | null
  numero_serie: string | null
  estado_operativo: string
  situacion: string
  ambiente_id: string | null
  categoria: { nombre: string } | null
  marcador: { x: number; y: number } | null
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
    .select('id, pabellon_id, nombre, numero, activo, plano_storage_path')
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
    .select('id, pabellon_id, nombre, numero, activo, plano_storage_path')
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

export async function listarEquiposPiso(pisoId: string): Promise<EquipoUbicacion[]> {
  const { data, error } = await supabase
    .from('equipos')
    .select(
      'id, codigo_institucional, nombre, marca, modelo, numero_serie, estado_operativo, situacion, ambiente_id, categorias_equipos(nombre), ambientes!inner(piso_id), marcadores_mapa(x, y)',
    )
    .eq('ambientes.piso_id', pisoId)
    .order('codigo_institucional')
  if (error) throw error

  return (data ?? []).map((item) => {
    const fila = item as unknown as {
      id: string
      codigo_institucional: string
      nombre: string
      marca: string | null
      modelo: string | null
      numero_serie: string | null
      estado_operativo: string
      situacion: string
      ambiente_id: string | null
      categorias_equipos: { nombre: string } | { nombre: string }[] | null
      marcadores_mapa: { x: number; y: number } | { x: number; y: number }[] | null
    }
    const categoria = Array.isArray(fila.categorias_equipos)
      ? fila.categorias_equipos[0] ?? null
      : fila.categorias_equipos
    const marcador = Array.isArray(fila.marcadores_mapa)
      ? fila.marcadores_mapa[0] ?? null
      : fila.marcadores_mapa
    return { ...fila, categoria, marcador }
  })
}

export async function guardarMarcador(
  equipoId: string,
  pisoId: string,
  x: number,
  y: number,
) {
  const { error } = await supabase.from('marcadores_mapa').upsert(
    { equipo_id: equipoId, piso_id: pisoId, x, y },
    { onConflict: 'equipo_id' },
  )
  if (error) throw error
}

export async function subirPlano(pisoId: string, file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('El plano debe ser JPG, PNG o WebP.')
  }

  const imagen = await createImageBitmap(file)
  const escala = Math.min(1, 2400 / Math.max(imagen.width, imagen.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.max(1, Math.round(imagen.width * escala))
  lienzo.height = Math.max(1, Math.round(imagen.height * escala))
  const contexto = lienzo.getContext('2d')
  if (!contexto) throw new Error('No se pudo preparar el plano.')
  contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
  imagen.close()

  const plano = await new Promise<Blob | null>((resolve) =>
    lienzo.toBlob(resolve, 'image/webp', 0.86),
  )
  if (!plano) throw new Error('No se pudo optimizar el plano.')
  if (plano.size > 10 * 1024 * 1024) {
    throw new Error('El plano optimizado supera el límite de 10 MB.')
  }

  const ruta = `pisos/${pisoId}/${crypto.randomUUID()}.webp`
  const { error: subidaError } = await supabase.storage
    .from('planos-institucionales')
    .upload(ruta, plano, { contentType: 'image/webp', upsert: false })
  if (subidaError) throw subidaError

  const { error: pisoError } = await supabase
    .from('pisos')
    .update({ plano_storage_path: ruta })
    .eq('id', pisoId)
  if (pisoError) {
    throw new Error(
      `El plano se subió, pero no se vinculó al piso: ${pisoError.message}`,
      { cause: pisoError },
    )
  }
  return ruta
}

export async function urlPlano(path: string) {
  const { data, error } = await supabase.storage
    .from('planos-institucionales')
    .createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}
