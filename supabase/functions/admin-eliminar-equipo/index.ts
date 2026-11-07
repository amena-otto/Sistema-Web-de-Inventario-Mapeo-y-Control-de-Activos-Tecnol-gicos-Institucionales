import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { dividirEnLotes } from '../_shared/lotes.ts'
import {
  estadoLimpiezaDesdePendiente,
  quitarArchivos,
  resumirLimpieza,
  type EliminacionPendiente,
  type ResumenLimpieza,
} from '../_shared/eliminacion.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// fotografias-drive acepta hasta 100 identificadores por solicitud. Se usan
// lotes de 50 tanto para Drive como para Storage, de modo que una limpieza
// grande pueda reanudarse por partes sin reenviar todo el conjunto.
const TAMANO_LOTE_ARCHIVOS = 50

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

type ErrorPostgrest = {
  code?: string
  message?: string
} | null

function respuesta(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function resumenNoVerificado(detalle: string): ResumenLimpieza {
  return {
    limpiezaCompleta: false,
    archivosPendientes: { storage: 0, drive: 0 },
    advertencia:
      `El equipo se eliminó definitivamente, pero no se pudo verificar la limpieza de sus fotografías (${detalle}). ` +
      'Revisa Supabase Storage y Google Drive y vuelve a confirmar la eliminación del mismo equipo para reanudar la limpieza.',
  }
}

async function actualizarPendiente(
  adminClient: SupabaseClient,
  equipoId: string,
  valores: Record<string, unknown>,
  bloqueoToken: string,
): Promise<ErrorPostgrest> {
  const { data, error } = await adminClient
    .from('eliminaciones_pendientes')
    .update({ ...valores, actualizado_at: new Date().toISOString() })
    .eq('equipo_id', equipoId)
    .eq('bloqueo_token', bloqueoToken)
    .select('equipo_id')
    .maybeSingle()
  return error ?? (data ? null : { message: 'El bloqueo de limpieza ya no pertenece a esta solicitud.' })
}

/**
 * Reanuda la limpieza registrada para un equipo ya eliminado.
 *
 * Se ejecuta SIEMPRE después de que la RPC transaccional confirmó la baja. Un
 * fallo de Storage o Drive no revierte la eliminación: se devuelve una
 * advertencia y la fila de eliminaciones_pendientes queda para el reintento.
 */
async function procesarLimpieza(
  adminClient: SupabaseClient,
  supabaseUrl: string,
  anonKey: string,
  token: string,
  equipoId: string,
  bloqueoToken: string,
): Promise<ResumenLimpieza> {
  const sinPendientes: ResumenLimpieza = {
    limpiezaCompleta: true,
    archivosPendientes: { storage: 0, drive: 0 },
    advertencia: null,
  }

  const { data, error } = await adminClient
    .from('eliminaciones_pendientes')
    .select('rutas_storage, drive_file_ids, storage_limpiado, drive_limpiado')
    .eq('equipo_id', equipoId)
    .maybeSingle()

  if (error) {
    console.error('No se pudo consultar la limpieza pendiente:', error.message)
    return resumenNoVerificado('no se pudo leer eliminaciones_pendientes')
  }

  if (!data) return sinPendientes

  const estado = estadoLimpiezaDesdePendiente(data as EliminacionPendiente)
  let rutasStorage = estado.rutasStorage
  let driveFileIds = estado.driveFileIds
  let storageLimpiado = estado.storageLimpiado
  let driveLimpiado = estado.driveLimpiado

  // 1. Archivos heredados de Supabase Storage, también por lotes.
  if (!storageLimpiado) {
    if (rutasStorage.length === 0) {
      storageLimpiado = true
    } else {
      for (const lote of dividirEnLotes(rutasStorage, TAMANO_LOTE_ARCHIVOS).slice(0, 2)) {
        const { data: referencias, error: referenciasError } = await adminClient
          .from('fotografias_equipos').select('id').in('ruta_storage', lote).limit(1)
        if (referenciasError || referencias?.length) {
          return resumenNoVerificado('una ruta sigue referenciada o no se pudo verificar')
        }
        const { error: storageError } = await adminClient.storage
          .from('fotografias-equipos')
          .remove(lote)

        if (storageError) {
          console.error(
            'No se pudieron eliminar las fotografías de Storage:',
            storageError.message,
          )
          break
        }

        rutasStorage = quitarArchivos(rutasStorage, lote)
        if (rutasStorage.length === 0) storageLimpiado = true

        const marcaError = await actualizarPendiente(adminClient, equipoId, {
          rutas_storage: rutasStorage,
          storage_limpiado: storageLimpiado,
        }, bloqueoToken)
        if (marcaError) {
          console.error(
            'No se pudo registrar el avance de Storage:',
            marcaError.message,
          )
          return resumenNoVerificado('no se pudo guardar el progreso')
        }
      }
    }

    if (storageLimpiado && estado.storageLimpiado !== true) {
      const marcaError = await actualizarPendiente(adminClient, equipoId, {
        storage_limpiado: true,
        rutas_storage: [],
      }, bloqueoToken)
      if (marcaError) {
        console.error(
          'No se pudo registrar la limpieza de Storage:',
          marcaError.message,
        )
        return resumenNoVerificado('no se pudo guardar el progreso')
      }
    }
  }

  // 2. Fotografías de Google Drive, lote a lote.
  if (!driveLimpiado) {
    if (driveFileIds.length === 0) {
      driveLimpiado = true
    } else {
      for (const lote of dividirEnLotes(driveFileIds, TAMANO_LOTE_ARCHIVOS).slice(0, 2)) {
        try {
          const response = await fetch(
            `${supabaseUrl}/functions/v1/fotografias-drive`,
            {
              method: 'DELETE',
              signal: AbortSignal.timeout(30_000),
              headers: {
                Authorization: `Bearer ${token}`,
                apikey: anonKey,
                'Content-Type': 'application/json',
                'x-operacion': 'limpiar-equipo',
              },
              body: JSON.stringify({ equipoId, driveFileIds: lote }),
            },
          )

          if (!response.ok) {
            const detalle = await response.text().catch(() => '')
            console.error(
              'No se pudieron mover a la papelera las fotos de Google Drive:',
              response.status,
              detalle,
            )
            break
          }
        } catch (error) {
          console.error(
            'Error de red al limpiar Google Drive:',
            error instanceof Error ? error.message : error,
          )
          break
        }

        driveFileIds = quitarArchivos(driveFileIds, lote)
        if (driveFileIds.length === 0) driveLimpiado = true

        const marcaError = await actualizarPendiente(adminClient, equipoId, {
          drive_file_ids: driveFileIds,
          drive_limpiado: driveLimpiado,
        }, bloqueoToken)
        if (marcaError) {
          console.error(
            'No se pudo registrar el avance de Google Drive:',
            marcaError.message,
          )
          return resumenNoVerificado('no se pudo guardar el progreso')
        }
      }
    }

    if (driveLimpiado && estado.driveLimpiado !== true) {
      const marcaError = await actualizarPendiente(adminClient, equipoId, {
        drive_limpiado: true,
        drive_file_ids: [],
      }, bloqueoToken)
      if (marcaError) {
        console.error(
          'No se pudo registrar la limpieza de Google Drive:',
          marcaError.message,
        )
        return resumenNoVerificado('no se pudo guardar el progreso')
      }
    }
  }

  const resumen = resumirLimpieza({
    storageLimpiado,
    driveLimpiado,
    rutasStorage,
    driveFileIds,
  })

  if (resumen.limpiezaCompleta) {
    const { error: borrarError } = await adminClient
      .from('eliminaciones_pendientes')
      .delete()
      .eq('equipo_id', equipoId)
      .eq('bloqueo_token', bloqueoToken)
    if (borrarError) {
      console.error(
        'No se pudo borrar el registro de limpieza pendiente:',
        borrarError.message,
      )
    }
  }

  return resumen
}

async function finalizarLimpieza(
  adminClient: SupabaseClient, supabaseUrl: string, anonKey: string,
  token: string, equipoId: string,
): Promise<ResumenLimpieza> {
  const bloqueoToken = crypto.randomUUID()
  const { data: pendiente, error: consultaError } = await adminClient
    .from('eliminaciones_pendientes').select('equipo_id').eq('equipo_id', equipoId).maybeSingle()
  if (consultaError) return resumenNoVerificado('no se pudo consultar el registro')
  if (!pendiente) return { limpiezaCompleta: true, archivosPendientes: { storage: 0, drive: 0 }, advertencia: null }
  const { data: adquirido, error } = await adminClient.rpc('reclamar_limpieza_equipo', {
    p_equipo_id: equipoId, p_token: bloqueoToken,
  })
  if (error || !adquirido) return resumenNoVerificado('limpieza en curso o falta confirmar la baja')
  try {
    return await procesarLimpieza(adminClient, supabaseUrl, anonKey, token, equipoId, bloqueoToken)
  } finally {
    await adminClient.from('eliminaciones_pendientes')
      .update({ bloqueo_token: null, bloqueo_hasta: null })
      .eq('equipo_id', equipoId).eq('bloqueo_token', bloqueoToken)
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return respuesta({ error: 'Método no permitido.' }, 405)
  }

  try {
    const token = request.headers
      .get('Authorization')
      ?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token) throw new HttpError('Se requiere una sesión autenticada.', 401)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new HttpError('La solicitud de eliminación no es válida.', 400)
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error('Falta configurar Supabase para la eliminación de equipos.')
      throw new HttpError('El servicio de administración no está configurado.', 500)
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }) },
    })
    const { data: authData, error: authError } = await authClient.auth.getUser(token)
    if (authError || !authData.user) {
      throw new HttpError('La sesión no es válida o ha expirado.', 401)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }) },
    })
    const { data: perfil, error: perfilError } = await adminClient
      .from('profiles')
      .select('rol, activo')
      .eq('id', authData.user.id)
      .maybeSingle()
    if (perfilError) {
      console.error('No se pudo verificar el administrador:', perfilError.message)
      throw new HttpError('No se pudo verificar el permiso de administrador.', 500)
    }
    if (perfil?.rol !== 'admin' || perfil.activo !== true) {
      throw new HttpError('Solo un administrador activo puede eliminar equipos.', 403)
    }

    if (typeof body === 'object' && body !== null && 'accion' in body && body.accion === 'listar-pendientes') {
      const { data, error } = await adminClient.from('eliminaciones_pendientes')
        .select('equipo_id, codigo_institucional, rutas_storage, drive_file_ids, creado_at, bloqueo_hasta')
        .order('creado_at').limit(100)
      if (error) throw new HttpError('No se pudieron consultar las limpiezas pendientes.', 500)
      return respuesta({ success: true, pendientes: (data ?? []).map((fila) => ({
        equipoId: fila.equipo_id, codigoInstitucional: fila.codigo_institucional,
        storage: fila.rutas_storage.length, drive: fila.drive_file_ids.length,
        creadoAt: fila.creado_at, bloqueoHasta: fila.bloqueo_hasta,
      })) })
    }

    if (
      typeof body !== 'object' ||
      body === null ||
      !('equipoId' in body) ||
      typeof body.equipoId !== 'string' ||
      !uuidPattern.test(body.equipoId) ||
      !('codigoInstitucional' in body) ||
      typeof body.codigoInstitucional !== 'string' ||
      !body.codigoInstitucional.trim()
    ) {
      throw new HttpError('El equipo o código institucional no es válido.', 400)
    }

    const equipoId = body.equipoId
    const codigoInstitucional = body.codigoInstitucional.trim()

    // Reintento de una eliminación ya confirmada: la constancia existe aunque
    // el equipo y sus fotografías ya no estén en la base. Se retoma la limpieza
    // de los archivos que hayan quedado pendientes y se devuelve éxito.
    const { data: constancia, error: constanciaError } = await adminClient
      .from('equipos_eliminados')
      .select('equipo_id, codigo_institucional')
      .eq('equipo_id', equipoId)
      .maybeSingle()
    if (constanciaError) {
      console.error('No se pudo consultar la constancia de la baja:', constanciaError.message)
      throw new HttpError('No se pudo verificar el estado de la eliminación.', 500)
    }
    if (constancia) {
      if (constancia.codigo_institucional !== codigoInstitucional) {
        throw new HttpError('El código institucional no coincide.', 400)
      }

      let resumen: ResumenLimpieza
      try {
        resumen = await finalizarLimpieza(
          adminClient,
          supabaseUrl,
          anonKey,
          token,
          equipoId,
        )
      } catch (error) {
        console.error(
          'No se pudo reanudar la limpieza pendiente:',
          error instanceof Error ? error.message : error,
        )
        resumen = resumenNoVerificado('error inesperado al reanudar la limpieza')
      }

      return respuesta(
        {
          success: true,
          equipoId,
          fotografias: null,
          reintento: true,
          limpiezaCompleta: resumen.limpiezaCompleta,
          archivosPendientes: resumen.archivosPendientes,
          advertencia: resumen.advertencia,
        },
        200,
      )
    }

    // PostgreSQL validates and locks the device atomically. A pre-query here
    // could incorrectly reject a concurrent request after the first commits.
    const { error: eliminarError } = await adminClient.rpc(
      'eliminar_equipo_dado_de_baja',
      {
        p_equipo_id: equipoId,
        p_codigo_institucional: codigoInstitucional,
        p_actor_id: authData.user.id,
      },
    )
    if (eliminarError) {
      const { data: constanciaTrasFallo, error: constanciaTrasFalloError } =
        await adminClient
          .from('equipos_eliminados')
          .select('equipo_id')
          .eq('equipo_id', equipoId)
          .maybeSingle()

      if (constanciaTrasFalloError || !constanciaTrasFallo) {
        console.error(
          'No se pudo eliminar el equipo y su historial:',
          eliminarError.message,
        )
        throw new HttpError(
          'No se pudo eliminar el equipo y su historial. No se modificó ninguna fotografía: el equipo sigue dado de baja y puedes reintentar la operación.',
          409,
        )
      }
      // La RPC sí se confirmó (por ejemplo, se perdió la respuesta HTTP). Se
      // continúa con la limpieza de archivos de forma idempotente.
    }

    let resumen: ResumenLimpieza
    try {
      resumen = await finalizarLimpieza(
        adminClient,
        supabaseUrl,
        anonKey,
        token,
        equipoId,
      )
    } catch (error) {
      console.error(
        'La limpieza de archivos quedó pendiente:',
        error instanceof Error ? error.message : error,
      )
      resumen = resumenNoVerificado('error inesperado al limpiar los archivos')
    }

    return respuesta(
      {
        success: true,
        equipoId,
        fotografias: null,
        reintento: false,
        limpiezaCompleta: resumen.limpiezaCompleta,
        archivosPendientes: resumen.archivosPendientes,
        advertencia: resumen.advertencia,
      },
      200,
    )
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Ocurrió un error inesperado al eliminar el equipo.'
    const status = error instanceof HttpError ? error.status : 500
    if (status === 500) console.error('Error inesperado al eliminar el equipo:', message)
    return respuesta({ error: message }, status)
  }
})
