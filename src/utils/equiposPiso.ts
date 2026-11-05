export type FilaEquipoPiso = {
  id: string
  codigo_institucional: string
  nombre: string
  marca: string | null
  modelo: string | null
  numero_serie: string | null
  estado_operativo: string
  situacion: string
  ambiente_id: string | null
  categoria_id: string | null
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
  categoria_id: string | null
  categoria: { nombre: string } | null
}

export type ErrorSupabase = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

export type RespuestaEquiposPiso = {
  data: FilaEquipoPiso[] | null
  error: ErrorSupabase | null
}

export function idsAmbientesDelPiso(
  ambientes: readonly { id: string; piso_id: string }[],
  pisoId: string,
): string[] {
  if (!pisoId) return []
  return ambientes
    .filter((ambiente) => ambiente.piso_id === pisoId)
    .map((ambiente) => ambiente.id)
}

export function describirErrorSupabase(error: unknown): string {
  if (typeof error !== 'object' || error === null) return ''
  const { code, message, details, hint } = error as ErrorSupabase
  return [
    code ? `code: ${code}` : '',
    message ? `message: ${message}` : '',
    details ? `details: ${details}` : '',
    hint ? `hint: ${hint}` : '',
  ]
    .filter(Boolean)
    .join(' | ')
}

export function registrarErrorSupabase(contexto: string, error: unknown) {
  const detalle = describirErrorSupabase(error)
  if (detalle) console.error(`${contexto} | ${detalle}`, error)
  else console.error(contexto, error)
}

export function mapearEquipoPiso(
  fila: FilaEquipoPiso,
  categorias: ReadonlyMap<string, string> = new Map(),
): EquipoUbicacion {
  const nombreCategoria = fila.categoria_id
    ? categorias.get(fila.categoria_id)
    : undefined
  return {
    id: fila.id,
    codigo_institucional: fila.codigo_institucional,
    nombre: fila.nombre,
    marca: fila.marca,
    modelo: fila.modelo,
    numero_serie: fila.numero_serie,
    estado_operativo: fila.estado_operativo,
    situacion: fila.situacion,
    ambiente_id: fila.ambiente_id,
    categoria_id: fila.categoria_id,
    categoria: nombreCategoria ? { nombre: nombreCategoria } : null,
  }
}

export async function cargarEquiposDeAmbientes(
  ambienteIds: readonly string[],
  consultar: (ids: string[]) => Promise<RespuestaEquiposPiso>,
  categorias: ReadonlyMap<string, string> = new Map(),
): Promise<EquipoUbicacion[]> {
  if (!ambienteIds.length) return []

  const { data, error } = await consultar([...ambienteIds])
  if (error) throw error

  return (data ?? []).map((fila) => mapearEquipoPiso(fila, categorias))
}
