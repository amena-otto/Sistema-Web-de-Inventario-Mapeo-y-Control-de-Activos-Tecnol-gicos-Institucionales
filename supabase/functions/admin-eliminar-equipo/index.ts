import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function respuesta(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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

    const rutasStorage = (fotografias ?? [])
      .map((foto) => foto.ruta_storage)
      .filter((ruta): ruta is string => Boolean(ruta))
    if (rutasStorage.length) {
      const { error: storageError } = await adminClient.storage
        .from('fotografias-equipos')
        .remove(rutasStorage)
      if (storageError) {
        console.error('No se pudieron eliminar las fotos de Storage:', storageError.message)
        throw new HttpError(
          'No se pudieron eliminar las fotografías de Storage. El equipo continúa dado de baja; vuelve a intentarlo.',
          502,
        )
      }
    }

    const driveFotos = (fotografias ?? []).filter((foto) => foto.drive_file_id)
    for (const foto of driveFotos) {
      const response = await fetch(`${supabaseUrl}/functions/v1/fotografias-drive`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fotografiaId: foto.id, equipoId }),
      })
      if (!response.ok) {
        console.error('No se pudo eliminar una foto de Google Drive:', response.status)
        throw new HttpError(
          'No se pudieron eliminar todas las fotografías de Google Drive. El equipo continúa dado de baja; vuelve a intentarlo.',
          502,
        )
      }
    }

    const { error: eliminarError } = await adminClient.rpc(
      'eliminar_equipo_dado_de_baja',
      {
        p_equipo_id: equipoId,
        p_codigo_institucional: codigoInstitucional,
        p_actor_id: authData.user.id,
      },
    )
    if (eliminarError) {
      console.error('No se pudo eliminar el equipo y su historial:', eliminarError.message)
      throw new HttpError(
        'No se pudo eliminar el equipo y su historial. El registro sigue dado de baja; vuelve a intentarlo.',
        409,
      )
    }

    return respuesta({ success: true, equipoId }, 200)
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Ocurrió un error inesperado al eliminar el equipo.'
    const status = error instanceof HttpError ? error.status : 500
    if (status === 500) console.error('Error inesperado al eliminar el equipo:', message)
    return respuesta({ error: message }, status)
  }
})
