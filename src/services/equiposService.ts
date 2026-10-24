import { supabase } from './supabaseClient'

export const estadosOperativos = [
  'operativo',
  'con_fallas',
  'en_mantenimiento',
  'inoperativo',
  'en_almacen',
] as const

export type EstadoOperativo = (typeof estadosOperativos)[number]

export type Equipo = {
  id: string
  codigo_institucional: string
  categoria_id: string
  ambiente_id: string | null
  nombre: string
  marca: string | null
  modelo: string | null
  numero_serie: string | null
  codigo_patrimonial: string | null
  posicion: string | null
  responsable_id: string | null
  estado_operativo: EstadoOperativo
  situacion: 'activo' | 'baja' | 'archivado'
  deleted_at?: string | null
  fecha_adquisicion: string | null
  fecha_garantia: string | null
  observaciones: string | null
  created_at: string
  updated_at: string
}

export type DatosEquipo = Pick<
  Equipo,
  | 'categoria_id'
  | 'ambiente_id'
  | 'nombre'
  | 'marca'
  | 'modelo'
  | 'numero_serie'
  | 'codigo_patrimonial'
  | 'posicion'
  | 'responsable_id'
  | 'estado_operativo'
  | 'fecha_adquisicion'
  | 'fecha_garantia'
  | 'observaciones'
>

export type Categoria = { id: string; nombre: string }
export type Ambiente = {
  id: string
  piso_id: string
  pabellon_id: string
  codigo: string
  nombre: string
  piso: string
  pabellon: string
}
export type UbicacionEquipo = {
  codigo: string
  nombre: string
  activo: boolean
  piso: string
  pabellon: string
}
export type Responsable = {
  id: string
  nombres: string
  apellidos: string
  rol: string
}
export type Componente = {
  id: string
  tipo: string
  marca: string | null
  modelo: string | null
  capacidad: string | null
  numero_serie: string | null
  observaciones: string | null
}
export type RelacionEquipo = {
  id: string
  equipo_principal_id: string
  equipo_relacionado_id: string
  tipo_relacion: string
}
export type Fotografia = {
  id: string
  ruta_storage: string | null
  drive_file_id: string | null
  descripcion: string | null
  tipo: string
}
export type FotografiaConUrl = Fotografia & { url: string }

export async function cargarCatalogos() {
  const [categoriasResult, ambientesResult, responsablesResult] =
    await Promise.all([
      supabase
        .from('categorias_equipos')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre'),
      supabase
        .from('ambientes')
        .select(
          'id, codigo, nombre, piso_id, pisos!inner(nombre, pabellon_id, pabellones!inner(nombre))',
        )
        .eq('activo', true)
        .order('nombre'),
      supabase
        .from('profiles')
        .select('id, nombres, apellidos, rol')
        .eq('activo', true)
        .order('apellidos'),
    ])

  if (categoriasResult.error) throw categoriasResult.error
  if (ambientesResult.error) throw ambientesResult.error
  if (responsablesResult.error) throw responsablesResult.error

  const ambientes = (ambientesResult.data ?? []).map((item) => {
    const fila = item as unknown as {
      id: string
      codigo: string
      nombre: string
      piso_id: string
      pisos: { nombre: string; pabellon_id: string; pabellones: { nombre: string } }
    }
    return {
      id: fila.id,
      piso_id: fila.piso_id,
      pabellon_id: fila.pisos.pabellon_id,
      codigo: fila.codigo,
      nombre: fila.nombre,
      piso: fila.pisos.nombre,
      pabellon: fila.pisos.pabellones.nombre,
    }
  })

  return {
    categorias: categoriasResult.data as Categoria[],
    ambientes,
    responsables: responsablesResult.data as Responsable[],
  }
}

export async function crearCategoria(nombre: string): Promise<Categoria> {
  const { data, error } = await supabase
    .from('categorias_equipos')
    .insert({ nombre: nombre.trim() })
    .select('id, nombre')
    .single()
  if (error) throw error
  return data as Categoria
}

export async function listarEquipos({
  pagina,
  porPagina,
  busqueda,
  estado,
  categoriaId,
  ambienteId,
  ambienteIds,
  sinUbicacion,
  ordenReciente = false,
}: {
  pagina: number
  porPagina: number
  busqueda: string
  estado: string
  categoriaId: string
  ambienteId: string
  ambienteIds?: string[]
  sinUbicacion?: boolean
  ordenReciente?: boolean
}) {
  let consulta = supabase
    .from('equipos')
    .select(
      'id, codigo_institucional, categoria_id, ambiente_id, nombre, marca, modelo, numero_serie, codigo_patrimonial, posicion, responsable_id, estado_operativo, situacion, fecha_adquisicion, fecha_garantia, observaciones, created_at, updated_at',
      { count: 'exact' },
    )
    .order(ordenReciente ? 'created_at' : 'codigo_institucional', {
      ascending: !ordenReciente,
    })
    .order('codigo_institucional')
    .range((pagina - 1) * porPagina, pagina * porPagina - 1)

  if (busqueda) {
    const seguro = busqueda.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s_-]/g, '').trim()
    if (seguro) {
      const patron = `*${seguro}*`
      consulta = consulta.or(
        `codigo_institucional.ilike.${patron},nombre.ilike.${patron},marca.ilike.${patron},modelo.ilike.${patron},numero_serie.ilike.${patron},codigo_patrimonial.ilike.${patron}`,
      )
    }
  }

  if (estado === 'baja') {
    consulta = consulta.eq('situacion', 'baja')
  } else if (estado === 'archivado') {
    consulta = consulta.eq('situacion', 'archivado')
  } else if (estado) {
    consulta = consulta.eq('estado_operativo', estado).eq('situacion', 'activo')
  }
  if (categoriaId) consulta = consulta.eq('categoria_id', categoriaId)
  if (ambienteId) {
    consulta = consulta.eq('ambiente_id', ambienteId)
  } else if (sinUbicacion) {
    consulta = consulta.is('ambiente_id', null)
  } else if (ambienteIds) {
    if (!ambienteIds.length) return { equipos: [], total: 0 }
    consulta = consulta.in('ambiente_id', ambienteIds)
  }

  const { data, error, count } = await consulta
  if (error) throw error
  return { equipos: (data ?? []) as Equipo[], total: count ?? 0 }
}

export async function listarEquiposParaExportar(filtros: {
  busqueda: string
  estado: string
  categoriaId: string
  ambienteId: string
  ambienteIds?: string[]
  sinUbicacion?: boolean
}): Promise<{
  equipos: Equipo[]
  categorias: Categoria[]
  ambientes: Ambiente[]
}> {
  const porLote = 500
  const equipos: Equipo[] = []

  for (let inicio = 0; ; inicio += porLote) {
    let consulta = supabase
      .from('equipos')
      .select(
        'id, codigo_institucional, categoria_id, ambiente_id, nombre, marca, modelo, numero_serie, codigo_patrimonial, posicion, responsable_id, estado_operativo, situacion, deleted_at, fecha_adquisicion, fecha_garantia, observaciones, created_at, updated_at',
      )
      .order('codigo_institucional')
      .range(inicio, inicio + porLote - 1)

    if (filtros.busqueda) {
      const seguro = filtros.busqueda
        .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s_-]/g, '')
        .trim()
      if (seguro) {
        const patron = `*${seguro}*`
        consulta = consulta.or(
          `codigo_institucional.ilike.${patron},nombre.ilike.${patron},marca.ilike.${patron},modelo.ilike.${patron},numero_serie.ilike.${patron},codigo_patrimonial.ilike.${patron}`,
        )
      }
    }
    if (filtros.estado === 'baja') {
      consulta = consulta.eq('situacion', 'baja')
    } else if (filtros.estado === 'archivado') {
      consulta = consulta.eq('situacion', 'archivado')
    } else if (filtros.estado === 'activo') {
      consulta = consulta.eq('situacion', 'activo')
    } else if (filtros.estado) {
      consulta = consulta.eq('estado_operativo', filtros.estado).eq('situacion', 'activo')
    }
    if (filtros.categoriaId) consulta = consulta.eq('categoria_id', filtros.categoriaId)
    if (filtros.ambienteId) {
      consulta = consulta.eq('ambiente_id', filtros.ambienteId)
    } else if (filtros.sinUbicacion) {
      consulta = consulta.is('ambiente_id', null)
    } else if (filtros.ambienteIds) {
      if (!filtros.ambienteIds.length) {
        return { equipos: [], categorias: [], ambientes: [] }
      }
      consulta = consulta.in('ambiente_id', filtros.ambienteIds)
    }

    const { data, error } = await consulta
    if (error) throw error

    const lote = (data ?? []) as Equipo[]
    equipos.push(...lote)
    if (lote.length < porLote) break
  }

  const [categoriasResult, ambientesResult] = await Promise.all([
    supabase.from('categorias_equipos').select('id, nombre'),
    supabase
      .from('ambientes')
      .select('id, codigo, nombre, pisos!inner(id, nombre, pabellones!inner(id, nombre))'),
  ])
  if (categoriasResult.error) throw categoriasResult.error
  if (ambientesResult.error) throw ambientesResult.error

  const ambientes = (ambientesResult.data ?? []).map((item) => {
    const fila = item as unknown as {
      id: string
      codigo: string
      nombre: string
      pisos: { id: string; nombre: string; pabellones: { id: string; nombre: string } }
    }
    return {
      id: fila.id,
      piso_id: fila.pisos.id,
      pabellon_id: fila.pisos.pabellones.id,
      codigo: fila.codigo,
      nombre: fila.nombre,
      piso: fila.pisos.nombre,
      pabellon: fila.pisos.pabellones.nombre,
    }
  })

  return {
    equipos,
    categorias: (categoriasResult.data ?? []) as Categoria[],
    ambientes,
  }
}

export async function obtenerEquipo(id: string): Promise<Equipo> {
  const { data, error } = await supabase
    .from('equipos')
    .select(
      'id, codigo_institucional, categoria_id, ambiente_id, nombre, marca, modelo, numero_serie, codigo_patrimonial, posicion, responsable_id, estado_operativo, situacion, deleted_at, fecha_adquisicion, fecha_garantia, observaciones, created_at, updated_at',
    )
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Equipo
}

export async function crearEquipo(datos: DatosEquipo): Promise<Equipo> {
  const { data, error } = await supabase
    .from('equipos')
    .insert(datos)
    .select(
      'id, codigo_institucional, categoria_id, ambiente_id, nombre, marca, modelo, numero_serie, codigo_patrimonial, posicion, responsable_id, estado_operativo, situacion, fecha_adquisicion, fecha_garantia, observaciones, created_at, updated_at',
    )
    .single()
  if (error) throw error
  return data as Equipo
}

export async function actualizarEquipo(
  id: string,
  datos: DatosEquipo,
): Promise<Equipo> {
  const { data, error } = await supabase
    .from('equipos')
    .update(datos)
    .eq('id', id)
    .select(
      'id, codigo_institucional, categoria_id, ambiente_id, nombre, marca, modelo, numero_serie, codigo_patrimonial, posicion, responsable_id, estado_operativo, situacion, fecha_adquisicion, fecha_garantia, observaciones, created_at, updated_at',
    )
    .single()
  if (error) throw error
  return data as Equipo
}

export async function posiblesDuplicados(
  serie: string,
  patrimonial: string,
  excluirId?: string,
  identidad?: Pick<DatosEquipo, 'categoria_id' | 'nombre' | 'marca' | 'modelo'>,
): Promise<Equipo[]> {
  const columnas = [
    ['numero_serie', serie.trim()],
    ['codigo_patrimonial', patrimonial.trim()],
  ] as const
  const encontrados = new Map<string, Equipo>()

  for (const [columna, valor] of columnas) {
    if (!valor) continue
    let consulta = supabase
      .from('equipos')
      .select(
        'id, codigo_institucional, categoria_id, ambiente_id, nombre, marca, modelo, numero_serie, codigo_patrimonial, posicion, responsable_id, estado_operativo, situacion, deleted_at, fecha_adquisicion, fecha_garantia, observaciones, created_at, updated_at',
      )
      .eq(columna, valor)
      .limit(10)
    if (excluirId) consulta = consulta.neq('id', excluirId)
    const { data, error } = await consulta
    if (error) throw error
    for (const equipo of data ?? []) {
      encontrados.set(equipo.id, equipo as Equipo)
    }
  }

  if (
    identidad?.categoria_id &&
    identidad.nombre.trim() &&
    identidad.marca?.trim() &&
    identidad.modelo?.trim()
  ) {
    let consulta = supabase
      .from('equipos')
      .select(
        'id, codigo_institucional, categoria_id, ambiente_id, nombre, marca, modelo, numero_serie, codigo_patrimonial, posicion, responsable_id, estado_operativo, situacion, deleted_at, fecha_adquisicion, fecha_garantia, observaciones, created_at, updated_at',
      )
      .eq('categoria_id', identidad.categoria_id)
      .eq('nombre', identidad.nombre.trim())
      .eq('marca', identidad.marca.trim())
      .eq('modelo', identidad.modelo.trim())
      .limit(10)
    if (excluirId) consulta = consulta.neq('id', excluirId)
    const { data, error } = await consulta
    if (error) throw error
    for (const equipo of data ?? []) encontrados.set(equipo.id, equipo as Equipo)
  }

  return [...encontrados.values()]
}

export async function obtenerDatosDetalleEquipo(
  id: string,
  ambienteId?: string | null,
) {
  const [componentes, relaciones, ubicacionResult] = await Promise.all([
    supabase
      .from('componentes')
      .select('id, tipo, marca, modelo, capacidad, numero_serie, observaciones')
      .eq('equipo_id', id)
      .order('tipo'),
    supabase
      .from('relaciones_equipos')
      .select('id, equipo_principal_id, equipo_relacionado_id, tipo_relacion')
      .or(`equipo_principal_id.eq.${id},equipo_relacionado_id.eq.${id}`),
    ambienteId
      ? supabase
          .from('ambientes')
          .select('codigo, nombre, activo, pisos!inner(nombre, pabellones!inner(nombre))')
          .eq('id', ambienteId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (componentes.error) throw componentes.error
  if (relaciones.error) throw relaciones.error
  if (ubicacionResult.error) throw ubicacionResult.error

  const ubicacionFila = ubicacionResult.data as unknown as {
    codigo: string
    nombre: string
    activo: boolean
    pisos: { nombre: string; pabellones: { nombre: string } }
  } | null
  const ubicacion = ubicacionFila
    ? {
        codigo: ubicacionFila.codigo,
        nombre: ubicacionFila.nombre,
        activo: ubicacionFila.activo,
        piso: ubicacionFila.pisos.nombre,
        pabellon: ubicacionFila.pisos.pabellones.nombre,
      }
    : null

  return {
    componentes: (componentes.data ?? []) as Componente[],
    relaciones: (relaciones.data ?? []) as RelacionEquipo[],
    ubicacion,
  }
}

export async function obtenerFotografiasEquipo(
  equipoId: string,
): Promise<FotografiaConUrl[]> {
  const { data, error } = await supabase
    .from('fotografias_equipos')
    .select('id, ruta_storage, drive_file_id, descripcion, tipo')
    .eq('equipo_id', equipoId)
    .order('created_at', { ascending: false })
    .order('id')
  if (error) throw error

  let principalElegida = false
  const resultados = await Promise.allSettled(
    (data ?? []).map(async (foto) => {
      let tipo = foto.tipo
      if (tipo === 'principal') {
        if (principalElegida) tipo = 'adicional'
        else principalElegida = true
      }
      if (foto.drive_file_id) {
        return { ...foto, tipo, url: await descargarFotografiaDrive(foto.id) }
      }
      if (!foto.ruta_storage) {
        throw new Error(`La fotografía ${foto.id} no tiene una ubicación registrada.`)
      }
      const { data, error } = await supabase.storage
        .from('fotografias-equipos')
        .createSignedUrl(foto.ruta_storage, 3600)
      if (error) throw error
      return { ...foto, tipo, url: data.signedUrl }
    }),
  )
  const fallida = resultados.find((resultado) => resultado.status === 'rejected')
  if (fallida?.status === 'rejected') {
    resultados.forEach((resultado) => {
      if (resultado.status === 'fulfilled' && resultado.value.url.startsWith('blob:')) {
        URL.revokeObjectURL(resultado.value.url)
      }
    })
    throw fallida.reason
  }
  return resultados.map((resultado) => {
    if (resultado.status !== 'fulfilled') throw resultado.reason
    return resultado.value
  })
}

export async function obtenerDetalleEquipo(
  id: string,
  ambienteId?: string | null,
) {
  const [detalle, fotografias] = await Promise.all([
    obtenerDatosDetalleEquipo(id, ambienteId),
    obtenerFotografiasEquipo(id),
  ])
  return {
    ...detalle,
    fotografias,
  }
}

export async function guardarComponente(
  equipoId: string,
  componente: Omit<Componente, 'id'>,
) {
  const { data: existente, error: consultaError } = await supabase
    .from('componentes')
    .select('id')
    .eq('equipo_id', equipoId)
    .eq('tipo', componente.tipo)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (consultaError) throw consultaError

  if (existente) {
    const { error } = await supabase
      .from('componentes')
      .update(componente)
      .eq('id', existente.id)
    if (error) throw error
    return
  }
  if (!componente.capacidad && !componente.marca && !componente.modelo && !componente.observaciones) {
    return
  }

  const { error } = await supabase
    .from('componentes')
    .insert({ equipo_id: equipoId, ...componente })
  if (error) throw error
}

export async function listarOpcionesRelacion(excluirId: string) {
  const { data, error } = await supabase
    .from('equipos')
    .select('id, codigo_institucional, nombre')
    .eq('situacion', 'activo')
    .neq('id', excluirId)
    .order('codigo_institucional')
    .limit(500)
  if (error) throw error
  return data ?? []
}

export async function guardarRelacion(
  principalId: string,
  relacionadoId: string,
) {
  const { data: existenteDirecto, error: consultaDirectaError } = await supabase
    .from('relaciones_equipos')
    .select('id')
    .eq('equipo_principal_id', principalId)
    .eq('equipo_relacionado_id', relacionadoId)
    .limit(1)
    .maybeSingle()
  if (consultaDirectaError) throw consultaDirectaError
  const { data: existenteInverso, error: consultaInversaError } = await supabase
    .from('relaciones_equipos')
    .select('id')
    .eq('equipo_principal_id', relacionadoId)
    .eq('equipo_relacionado_id', principalId)
    .limit(1)
    .maybeSingle()
  if (consultaInversaError) throw consultaInversaError
  if (existenteDirecto || existenteInverso) {
    throw new Error('Esos equipos ya están relacionados.')
  }

  const { error } = await supabase.from('relaciones_equipos').insert({
    equipo_principal_id: principalId,
    equipo_relacionado_id: relacionadoId,
    tipo_relacion: 'periferico',
  })
  if (error) throw error
}

export async function darDeBajaEquipo(id: string) {
  const { error } = await supabase
    .from('equipos')
    .update({ situacion: 'baja', deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function reactivarEquipo(id: string) {
  const { error } = await supabase
    .from('equipos')
    .update({ situacion: 'activo', deleted_at: null })
    .eq('id', id)
  if (error) throw error
}
export async function subirFotografia(
  equipoId: string,
  archivo: File,
  modo: 'principal' | 'adicional' | 'reemplazar' = 'principal',
): Promise<void> {
  const optimizada = await optimizarImagen(archivo)
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!sessionData.session) throw new Error('Inicia sesión para subir una fotografía.')

  const body = new FormData()
  body.append('equipoId', equipoId)
  body.append('modo', modo)
  body.append('file', optimizada, 'fotografia.jpg')
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fotografias-drive`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body,
    },
  )

  if (!response.ok) {
    const result: unknown = await response.json().catch(() => null)
    const message =
      typeof result === 'object' && result !== null && 'error' in result &&
      typeof result.error === 'string'
        ? result.error
        : `No se pudo subir la fotografía (HTTP ${response.status}).`
    throw new Error(message)
  }
}

async function operarFotografiaDrive(
  method: 'PATCH' | 'DELETE',
  fotografiaId: string,
  equipoId: string,
): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!sessionData.session) throw new Error('Inicia sesión para gestionar fotografías.')

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fotografias-drive`,
    {
      method,
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fotografiaId, equipoId }),
    },
  )
  if (!response.ok) {
    const result: unknown = await response.json().catch(() => null)
    const message =
      typeof result === 'object' && result !== null && 'error' in result &&
      typeof result.error === 'string'
        ? result.error
        : `No se pudo gestionar la fotografía (HTTP ${response.status}).`
    throw new Error(message)
  }
}

export function establecerFotografiaPrincipal(fotografiaId: string, equipoId: string) {
  return operarFotografiaDrive('PATCH', fotografiaId, equipoId)
}

export function eliminarFotografia(fotografiaId: string, equipoId: string) {
  return operarFotografiaDrive('DELETE', fotografiaId, equipoId)
}

async function descargarFotografiaDrive(fotografiaId: string): Promise<string> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!sessionData.session) throw new Error('Inicia sesión para ver esta fotografía.')

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fotografias-drive?id=${encodeURIComponent(fotografiaId)}`,
    {
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    },
  )
  if (!response.ok) {
    const result: unknown = await response.json().catch(() => null)
    const message =
      typeof result === 'object' && result !== null && 'error' in result &&
      typeof result.error === 'string'
        ? result.error
        : `No se pudo cargar la fotografía (HTTP ${response.status}).`
    throw new Error(message)
  }

  return URL.createObjectURL(await response.blob())
}

async function optimizarImagen(archivo: File): Promise<Blob> {
  if (!archivo.type.startsWith('image/')) {
    throw new Error('Selecciona un archivo de imagen.')
  }

  const imagen = await createImageBitmap(archivo)
  const maximo = 1600
  const escala = Math.min(1, maximo / Math.max(imagen.width, imagen.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.max(1, Math.round(imagen.width * escala))
  lienzo.height = Math.max(1, Math.round(imagen.height * escala))
  const contexto = lienzo.getContext('2d')
  if (!contexto) throw new Error('No se pudo procesar la fotografía.')
  contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
  imagen.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    lienzo.toBlob(resolve, 'image/jpeg', 0.82),
  )
  if (!blob) throw new Error('No se pudo convertir la fotografía.')
  if (blob.size > 2 * 1024 * 1024) {
    throw new Error('La fotografía optimizada supera el límite de 2 MB.')
  }
  return blob
}

export async function importarFila(
  datos: DatosEquipo,
  serie?: string,
  tecnicas: Record<string, string> = {},
): Promise<Equipo> {
  const duplicados = await posiblesDuplicados(
    serie ?? '',
    datos.codigo_patrimonial ?? '',
    undefined,
    datos,
  )
  if (duplicados.length) {
    throw new Error(
      `Posible duplicado de ${duplicados.map((e) => e.codigo_institucional).join(', ')}`,
    )
  }
  const equipo = await crearEquipo(datos)
  for (const [tipo, capacidad] of Object.entries(tecnicas)) {
    if (!capacidad.trim()) continue
    try {
      await guardarComponente(equipo.id, {
        tipo,
        marca: null,
        modelo: null,
        capacidad: capacidad.trim(),
        numero_serie: null,
        observaciones: null,
      })
    } catch (error) {
      throw new Error(
        `El equipo ${equipo.codigo_institucional} fue creado, pero falló el componente ${tipo}: ${mostrarErrorServicio(error)}`,
        { cause: error },
      )
    }
  }
  return equipo
}

function mostrarErrorServicio(error: unknown) {
  return error instanceof Error ? error.message : 'error desconocido'
}
