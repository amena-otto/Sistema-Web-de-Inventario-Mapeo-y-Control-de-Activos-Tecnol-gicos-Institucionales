import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { dividirEnLotes } from '../_shared/lotes.ts'
import {
  estadoLimpiezaDesdePendiente,
  extraerArchivosEquipo,
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

function esTablaAusente(error: ErrorPostgrest): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205'
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
): Promise<ErrorPostgrest> {
  const { error } = await adminClient
    .from('eliminaciones_pendientes')
    .update({ ...valores, actualizado_at: new Date().toISOString() })
    .eq('equipo_id', equipoId)
  return error
}

/**
 * Reanuda la limpieza registrada para un equipo ya eliminado.
 *
 * Se ejecuta SIEMPRE después de que la RPC transaccional confirmó la baja. Un
 * fallo de Storage o Drive no revierte la eliminación: se devuelve una
 * advertencia y la fila de eliminaciones_pendientes queda para el reintento.
 */
async function finalizarLimpieza(
  adminClient: SupabaseClient,
  supabaseUrl: string,
  anonKey: string,
  token: string,
  equipoId: string,
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
    if (esTablaAusente(error)) {
      console.warn(
        'La tabla eliminaciones_pendientes no existe todavía; no hay archivos registrados que limpiar.',
      )
      return sinPendientes
    }
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
      for (const lote of dividirEnLotes(rutasStorage, TAMANO_LOTE_ARCHIVOS)) {
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
        })
        if (marcaError) {
          console.error(
            'No se pudo registrar el avance de Storage:',
            marcaError.message,
          )
          break
        }
      }
    }

    if (storageLimpiado && estado.storageLimpiado !== true) {
      const marcaError = await actualizarPendiente(adminClient, equipoId, {
        storage_limpiado: true,
        rutas_storage: [],
      })
      if (marcaError) {
        console.error(
          'No se pudo registrar la limpieza de Storage:',
          marcaError.message,
        )
      }
    }
  }

  // 2. Fotografías de Google Drive, lote a lote.
  if (!driveLimpiado) {
    if (driveFileIds.length === 0) {
      driveLimpiado = true
    } else {
      for (const lote of dividirEnLotes(driveFileIds, TAMANO_LOTE_ARCHIVOS)) {
        try {
          const response = await fetch(
            `${supabaseUrl}/functions/v1/fotografias-drive`,
            {
              method: 'DELETE',
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
        })
        if (marcaError) {
          console.error(
            'No se pudo registrar el avance de Google Drive:',
            marcaError.message,
          )
          break
        }
      }
    }

    if (driveLimpiado && estado.driveLimpiado !== true) {
      const marcaError = await actualizarPendiente(adminClient, equipoId, {
        drive_limpiado: true,
        drive_file_ids: [],
      })
      if (marcaError) {
        console.error(
          'No se pudo registrar la limpieza de Google Drive:',
          marcaError.message,
        )
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
    if (borrarError) {
      console.error(
        'No se pudo borrar el registro de limpieza pendiente:',
        borrarError.message,
      )
    }
  }

  return resumen
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error('Falta configurar Supabase para la eliminación de equipos.')
      throw new HttpError('El servicio de administración no está configurado.', 500)
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: authData, error: authError } = await authClient.auth.getUser(token)
    if (authError || !authData.user) {
      throw new HttpError('La sesión no es válida o ha expirado.', 401)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
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

    const { data: equipo, error: equipoError } = await adminClient
      .from('equipos')
      .select('id, codigo_institucional, situacion')
      .eq('id', equipoId)
      .maybeSingle()
    if (equipoError) {
      console.error('No se pudo consultar el equipo a eliminar:', equipoError.message)
      throw new HttpError('No se pudo verificar el equipo seleccionado.', 500)
    }
    if (!equipo) throw new HttpError('El equipo ya no existe.', 404)
    if (equipo.situacion !== 'baja') {
      throw new HttpError('Solo se pueden eliminar equipos previamente dados de baja.', 409)
    }
    if (equipo.codigo_institucional !== codigoInstitucional) {
      throw new HttpError('El código institucional no coincide.', 400)
    }

    const { data: fotografias, error: fotosError } = await adminClient
      .from('fotografias_equipos')
      .select('id, ruta_storage, drive_file_id')
      .eq('equipo_id', equipoId)
    if (fotosError) {
      console.error('No se pudieron listar las fotografías del equipo:', fotosError.message)
      throw new HttpError('No se pudieron consultar las fotografías del equipo.', 500)
    }

    const archivos = extraerArchivosEquipo(fotografias)

    // La lista de archivos se persiste ANTES de la RPC. Si PostgreSQL falla,
    // no se ha tocado ningún archivo y el reintento usa esta misma lista.
    const { error: pendienteError } = await adminClient
      .from('eliminaciones_pendientes')
      .upsert(
        {
          equipo_id: equipoId,
          codigo_institucional: codigoInstitucional,
          rutas_storage: archivos.rutasStorage,
          drive_file_ids: archivos.driveFileIds,
          storage_limpiado: archivos.rutasStorage.length === 0,
          drive_limpiado: archivos.driveFileIds.length === 0,
          creado_por: authData.user.id,
          actualizado_at: new Date().toISOString(),
        },
        { onConflict: 'equipo_id' },
      )
    if (pendienteError) {
      console.error('No se pudo registrar la limpieza pendiente:', pendienteError.message)
      throw new HttpError(
        'No se pudo preparar la eliminación del equipo. No se modificó ninguna fotografía; vuelve a intentarlo.',
        500,
      )
    }

    // Solo después de confirmar la RPC se tocan Storage y Google Drive. Así un
    // fallo de PostgreSQL nunca deja al equipo sin sus fotografías.
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
        // El equipo y sus fotografías siguen intactos: la fila de limpieza
        // diferida no debe quedar registrada como trabajo pendiente. Se borra
        // en modo best-effort; si falla, el siguiente intento la sobrescribe.
        const { error: limpiarPendienteError } = await adminClient
          .from('eliminaciones_pendientes')
          .delete()
          .eq('equipo_id', equipoId)
        if (limpiarPendienteError) {
          console.warn(
            'No se pudo retirar la limpieza diferida tras el fallo de la RPC:',
            limpiarPendienteError.message,
          )
        }
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
        fotografias: (fotografias ?? []).length,
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
