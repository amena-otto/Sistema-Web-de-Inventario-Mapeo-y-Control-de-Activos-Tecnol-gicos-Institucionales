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
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return respuesta({ error: 'Método no permitido.' }, 405)
  }

  const authorization = request.headers.get('Authorization')
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!accessToken) {
    return respuesta({ error: 'Se requiere una sesión autenticada.' }, 401)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return respuesta({ error: 'El cuerpo de la solicitud no es JSON válido.' }, 400)
  }
  if (typeof body !== 'object' || body === null) {
    return respuesta({ error: 'Los datos de la solicitud son inválidos.' }, 400)
  }

  const userId = (body as Record<string, unknown>).userId
  if (
    typeof userId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
  ) {
    return respuesta({ error: 'El usuario seleccionado no es válido.' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const appUrl = Deno.env.get('APP_URL')?.replace(/\/+$/, '')

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !appUrl) {
    console.error('Falta configurar SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY o APP_URL.')
    return respuesta({ error: 'El servicio de restablecimiento no está configurado.' }, 500)
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
    return respuesta({ error: 'Solo un administrador activo puede restablecer contraseñas.' }, 403)
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

  const { data: cuenta, error: cuentaError } =
    await adminClient.auth.admin.getUserById(userId)
  const email = cuenta.user?.email
  if (cuentaError || !email) {
    console.error('No se pudo obtener el correo de la cuenta:', cuentaError?.message)
    return respuesta({ error: 'No se pudo obtener el correo asociado a esta cuenta.' }, 500)
  }

  const { error: envioError } = await authClient.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/restablecer-password`,
  })
  if (envioError) {
    console.error('No se pudo enviar el correo de restablecimiento:', envioError.message)
    return respuesta({ error: 'No se pudo enviar el enlace de restablecimiento. Inténtalo nuevamente.' }, 400)
  }

  return respuesta({ success: true }, 200)
})
