import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const roles = ['admin', 'tecnico', 'consulta'] as const
type Rol = (typeof roles)[number]

function esRol(value: unknown): value is Rol {
  return typeof value === 'string' && roles.some((rol) => rol === value)
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
    return respuesta({ error: 'Los datos del usuario son inválidos.' }, 400)
  }

  const entrada = body as Record<string, unknown>
  const email = typeof entrada.email === 'string' ? entrada.email.trim().toLowerCase() : ''
  const nombres = typeof entrada.nombres === 'string' ? entrada.nombres.trim() : ''
  const apellidos = typeof entrada.apellidos === 'string' ? entrada.apellidos.trim() : ''
  const password = typeof entrada.password === 'string' ? entrada.password : ''
  const rol = entrada.rol

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    (!email.endsWith('@ottotonsmann.edu.pe') &&
      !email.endsWith('@gmail.com')) ||
    nombres.length < 1 ||
    nombres.length > 100 ||
    apellidos.length < 1 ||
    apellidos.length > 100 ||
    password.length < 8 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !esRol(rol)
  ) {
    return respuesta(
      { error: 'Usa un correo @ottotonsmann.edu.pe o @gmail.com y revisa nombres, apellidos y rol. La contraseña requiere 8 caracteres, mayúscula, minúscula y número.' },
      400,
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Falta configurar SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.')
    return respuesta({ error: 'El servicio de creación de usuarios no está configurado.' }, 500)
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
    return respuesta({ error: 'Solo un administrador activo puede crear usuarios.' }, 403)
  }

  // La clave administrativa solo se usa en el backend. Auth rechaza duplicados.
  const { data: cuenta, error: cuentaError } = await adminClient.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nombres, apellidos },
  })
  if (cuentaError || !cuenta.user) {
    return respuesta({ error: cuentaError?.message ?? 'No se pudo crear la cuenta.' }, 400)
  }

  const { data: perfilCreado, error: actualizacionError } = await adminClient
    .from('profiles')
    .update({ nombres, apellidos, rol, activo: true })
    .eq('id', cuenta.user.id)
    .select('id, nombres, apellidos, rol, activo, created_at')
    .maybeSingle()

  if (actualizacionError || !perfilCreado) {
    const { error: eliminacionError } = await adminClient.auth.admin.deleteUser(
      cuenta.user.id,
    )

    if (eliminacionError) {
      console.error('No se pudo eliminar la cuenta tras fallar el perfil:', eliminacionError.message)
      return respuesta(
        { error: 'No se pudo completar el perfil ni limpiar la cuenta creada. Contacta al administrador técnico.' },
        500,
      )
    }

    console.error('No se pudo asignar el perfil a la cuenta creada:', actualizacionError?.message)
    return respuesta({ error: 'No se pudo asignar el perfil. La cuenta creada fue cancelada.' }, 500)
  }

  return respuesta({ ...perfilCreado, email }, 201)
})
