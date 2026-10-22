  import { createClient } from 'npm:@supabase/supabase-js@2'

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  function respuesta(body: Record<string, unknown>, status: number) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  Deno.serve(async (request: Request) => {
    try {
    if (request.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    if (request.method !== 'POST') {
      return respuesta({ error: 'Método no permitido.' }, 405)
    }

    const accessToken = request.headers
      .get('Authorization')
      ?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!accessToken) {
      return respuesta({ error: 'Se requiere una sesión autenticada.' }, 401)
    }

    let entrada: unknown
    try {
      entrada = await request.json()
    } catch {
      return respuesta({ error: 'El cuerpo de la solicitud no es JSON válido.' }, 400)
    }

    if (
      typeof entrada !== 'object' ||
      entrada === null ||
      !('userId' in entrada) ||
      typeof entrada.userId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        entrada.userId,
      )
    ) {
      return respuesta({ error: 'El usuario seleccionado no es válido.' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error('Falta configurar las variables de Supabase para eliminar usuarios.')
      return respuesta({ error: 'El servicio de administración no está configurado.' }, 500)
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: authData, error: authError } =
      await authClient.auth.getUser(accessToken)
    if (authError || !authData.user) {
      return respuesta({ error: 'La sesión no es válida o ha expirado.' }, 401)
    }
    if (authData.user.id === entrada.userId) {
      return respuesta({ error: 'No puedes eliminar tu propia cuenta.' }, 400)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: perfilAdmin, error: perfilAdminError } = await adminClient
      .from('profiles')
      .select('rol, activo')
      .eq('id', authData.user.id)
      .maybeSingle()

    if (perfilAdminError) {
      console.error('No se pudo verificar el administrador:', perfilAdminError.message)
      return respuesta({ error: 'No se pudo verificar el permiso de administrador.' }, 500)
    }
    if (perfilAdmin?.rol !== 'admin' || perfilAdmin.activo !== true) {
      return respuesta({ error: 'Solo un administrador activo puede eliminar usuarios.' }, 403)
    }

    const { data: perfilObjetivo, error: perfilObjetivoError } = await adminClient
      .from('profiles')
      .select('id, activo')
      .eq('id', entrada.userId)
      .maybeSingle()

    if (perfilObjetivoError) {
      console.error('No se pudo consultar el perfil a eliminar:', perfilObjetivoError.message)
      return respuesta({ error: 'No se pudo verificar el usuario seleccionado.' }, 500)
    }
    if (!perfilObjetivo) {
      return respuesta({ error: 'El usuario ya no existe.' }, 404)
    }
    if (perfilObjetivo.activo) {
      return respuesta({ error: 'Solo se pueden eliminar cuentas previamente desactivadas.' }, 409)
    }

    const { error: eliminarError } = await adminClient.auth.admin.deleteUser(
      entrada.userId,
    )
    if (eliminarError) {
      console.error('No se pudo eliminar permanentemente la cuenta:', eliminarError.message)
      if (eliminarError.code === '23503') {
        return respuesta(
          {
            error:
              'No se puede eliminar esta cuenta porque conserva referencias en el historial institucional. La cuenta permanece desactivada para preservar la trazabilidad.',
          },
          409,
        )
      }
      return respuesta(
        {
          error: `Supabase no pudo eliminar la cuenta: ${eliminarError.message}`,
        },
        409,
      )
    }

    return respuesta({ success: true, userId: entrada.userId }, 200)
    } catch (error) {
      console.error(
        'Error inesperado en admin-eliminar-usuario:',
        error instanceof Error ? error.message : error,
      )
      return respuesta({ error: 'Ocurrió un error inesperado al eliminar la cuenta.' }, 500)
    }
  })
