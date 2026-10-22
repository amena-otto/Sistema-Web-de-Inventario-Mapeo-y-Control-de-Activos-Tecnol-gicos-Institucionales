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
    if (typeof entrada !== 'object' || entrada === null) {
      return respuesta({ error: 'Los datos de la solicitud son inválidos.' }, 400)
    }

    const body = entrada as Record<string, unknown>
    const userId = body.userId
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (
      typeof userId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
    ) {
      return respuesta({ error: 'El usuario seleccionado no es válido.' }, 400)
    }
    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      (!email.endsWith('@ottotonsmann.edu.pe') &&
        !email.endsWith('@gmail.com'))
    ) {
      return respuesta(
        { error: 'Usa un correo válido @ottotonsmann.edu.pe o @gmail.com.' },
        400,
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error('Falta configurar las variables de Supabase para actualizar correos.')
      return respuesta({ error: 'El servicio de usuarios no está configurado.' }, 500)
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: authData, error: authError } =
      await authClient.auth.getUser(accessToken)
    if (authError || !authData.user) {
      return respuesta({ error: 'La sesión no es válida o ha expirado.' }, 401)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: perfilAdmin, error: perfilError } = await adminClient
      .from('profiles')
      .select('rol, activo')
      .eq('id', authData.user.id)
      .maybeSingle()

    if (perfilError) {
      console.error('No se pudo verificar el perfil administrador:', perfilError.message)
      return respuesta({ error: 'No se pudo verificar el permiso de administrador.' }, 500)
    }
    if (perfilAdmin?.rol !== 'admin' || perfilAdmin.activo !== true) {
      return respuesta({ error: 'Solo un administrador activo puede actualizar correos.' }, 403)
    }

    const { data: perfilObjetivo, error: perfilObjetivoError } = await adminClient
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle()
    if (perfilObjetivoError) {
      console.error('No se pudo verificar el usuario seleccionado:', perfilObjetivoError.message)
      return respuesta({ error: 'No se pudo verificar el usuario seleccionado.' }, 500)
    }
    if (!perfilObjetivo) {
      return respuesta({ error: 'El usuario seleccionado no existe.' }, 404)
    }

    const { data, error } = await adminClient.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    })
    if (error || !data.user) {
      console.error('No se pudo actualizar el correo:', error?.message)
      return respuesta(
        { error: error?.message ?? 'Supabase no confirmó la actualización del correo.' },
        400,
      )
    }

    return respuesta({ success: true, email: data.user.email ?? email }, 200)
  } catch (error) {
    console.error(
      'Error inesperado en admin-actualizar-correo:',
      error instanceof Error ? error.message : error,
    )
    return respuesta({ error: 'Ocurrió un error al actualizar el correo.' }, 500)
  }
})
