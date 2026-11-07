/**
 * Helpers puros para la eliminación definitiva de equipos.
 *
 * No dependen de Deno ni de Supabase para poder probarse con Node. Describen
 * qué archivos pertenecen a un equipo, cómo se interpreta la fila de
 * public.eliminaciones_pendientes y cómo se resume una limpieza incompleta.
 */

export type FotografiaArchivo = {
  ruta_storage?: string | null
  drive_file_id?: string | null
}

export type ArchivosEquipo = {
  rutasStorage: string[]
  driveFileIds: string[]
}

export type EliminacionPendiente = {
  rutas_storage?: unknown
  drive_file_ids?: unknown
  storage_limpiado?: boolean | null
  drive_limpiado?: boolean | null
}

export type EstadoLimpieza = {
  storageLimpiado: boolean
  driveLimpiado: boolean
  rutasStorage: string[]
  driveFileIds: string[]
}

export type ResumenLimpieza = {
  limpiezaCompleta: boolean
  archivosPendientes: {
    storage: number
    drive: number
  }
  advertencia: string | null
}

function agregarUnicos(destino: Set<string>, valores: readonly string[]) {
  for (const valor of valores) {
    const limpio = valor.trim()
    if (limpio) destino.add(limpio)
  }
}

function normalizarArreglo(valores: readonly unknown[]): string[] {
  const unicos = new Set<string>()
  agregarUnicos(
    unicos,
    valores.filter((valor): valor is string => typeof valor === 'string'),
  )
  return [...unicos]
}

// Convierte el literal de arreglo de PostgreSQL ({a,"b,c"}) sin depender del
// cliente. Supabase normalmente entrega text[] como arreglo de JavaScript, pero
// esta ruta mantiene compatibilidad con respuestas en texto.
function analizarArregloPostgres(valor: string): string[] {
  const interior = valor.slice(1, -1)
  if (!interior.trim()) return []

  const partes: string[] = []
  let actual = ''
  let entreComillas = false

  for (let indice = 0; indice < interior.length; indice += 1) {
    const caracter = interior[indice]

    if (caracter === '"') {
      if (entreComillas && interior[indice + 1] === '"') {
        actual += '"'
        indice += 1
      } else {
        entreComillas = !entreComillas
      }
      continue
    }

    if (caracter === ',' && !entreComillas) {
      partes.push(actual)
      actual = ''
      continue
    }

    actual += caracter
  }

  partes.push(actual)
  return partes
}

/**
 * Normaliza una lista de archivos proveniente de la base o del cuerpo HTTP.
 * Acepta arreglos, JSON serializado y el literal de arreglo de PostgreSQL.
 */
export function normalizarListaArchivos(valor: unknown): string[] {
  if (Array.isArray(valor)) return normalizarArreglo(valor)
  if (typeof valor !== 'string') return []

  const texto = valor.trim()
  if (!texto) return []

  if (texto.startsWith('[')) {
    try {
      const analizado: unknown = JSON.parse(texto)
      if (Array.isArray(analizado)) return normalizarArreglo(analizado)
    } catch {
      // Se intenta como literal de PostgreSQL.
    }
  }

  if (texto.startsWith('{') && texto.endsWith('}')) {
    return normalizarArreglo(analizarArregloPostgres(texto))
  }

  return normalizarArreglo([texto])
}

/** Extrae las rutas de Storage y los IDs de Drive de las fotos del equipo. */
export function extraerArchivosEquipo(
  fotografias: readonly FotografiaArchivo[] | null | undefined,
): ArchivosEquipo {
  const rutas = new Set<string>()
  const ids = new Set<string>()

  for (const fotografia of fotografias ?? []) {
    if (typeof fotografia.ruta_storage === 'string') {
      agregarUnicos(rutas, [fotografia.ruta_storage])
    }
    if (typeof fotografia.drive_file_id === 'string') {
      agregarUnicos(ids, [fotografia.drive_file_id])
    }
  }

  return { rutasStorage: [...rutas], driveFileIds: [...ids] }
}

/** Convierte la fila de eliminaciones_pendientes a un estado de limpieza. */
export function estadoLimpiezaDesdePendiente(
  pendiente: EliminacionPendiente,
): EstadoLimpieza {
  return {
    storageLimpiado: pendiente.storage_limpiado === true,
    driveLimpiado: pendiente.drive_limpiado === true,
    rutasStorage: normalizarListaArchivos(pendiente.rutas_storage),
    driveFileIds: normalizarListaArchivos(pendiente.drive_file_ids),
  }
}

/** Cantidad de archivos que aún deben limpiarse en cada destino. */
export function contarArchivosPendientes(estado: EstadoLimpieza) {
  return {
    storage: estado.storageLimpiado ? 0 : estado.rutasStorage.length,
    drive: estado.driveLimpiado ? 0 : estado.driveFileIds.length,
  }
}

/** Quita de una lista los elementos ya procesados, conservando el orden. */
export function quitarArchivos(
  lista: readonly string[],
  procesados: readonly string[],
): string[] {
  const quitar = new Set(procesados)
  return lista.filter((elemento) => !quitar.has(elemento))
}

/**
 * Resume el estado final de la limpieza. Si quedan archivos, construye el aviso
 * que se devuelve al cliente para que pueda reintentar la operación.
 */
export function resumirLimpieza(estado: EstadoLimpieza): ResumenLimpieza {
  const archivosPendientes = contarArchivosPendientes(estado)
  const limpiezaCompleta =
    archivosPendientes.storage === 0 && archivosPendientes.drive === 0

  if (limpiezaCompleta) {
    return { limpiezaCompleta, archivosPendientes, advertencia: null }
  }

  const partes: string[] = []
  if (archivosPendientes.storage > 0) {
    partes.push(
      `${archivosPendientes.storage} fotografía(s) en Supabase Storage`,
    )
  }
  if (archivosPendientes.drive > 0) {
    partes.push(`${archivosPendientes.drive} fotografía(s) en Google Drive`)
  }

  return {
    limpiezaCompleta,
    archivosPendientes,
    advertencia:
      `El equipo se eliminó definitivamente, pero quedaron archivos pendientes de limpieza: ${partes.join(' y ')}. ` +
      'Vuelve a confirmar la eliminación del mismo equipo: el sistema reanudará solo los archivos pendientes sin afectar el historial.',
  }
}
