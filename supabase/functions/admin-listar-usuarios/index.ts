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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error('Falta configurar las variables de Supabase para listar usuarios.')
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
      return respuesta({ error: 'Solo un administrador activo puede consultar usuarios.' }, 403)
    }

    const { data: perfiles, error: perfilesError } = await adminClient
      .from('profiles')
      .select('id, nombres, apellidos, rol, activo, created_at')
      .order('apellidos')
    if (perfilesError) {
      console.error('No se pudieron consultar los perfiles:', perfilesError.message)
      return respuesta({ error: 'No se pudieron cargar los perfiles de usuario.' }, 500)
    }

    const usuariosAuth = []
    const porPagina = 1000
    for (let pagina = 1; ; pagina += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({
        page: pagina,
        perPage: porPagina,
      })
      if (error) {
        console.error('No se pudieron consultar las cuentas Auth:', error.message)
        return respuesta({ error: 'No se pudieron cargar los correos de las cuentas.' }, 500)
      }

      usuariosAuth.push(...data.users)
      if (data.users.length < porPagina) break
    }

    const correosPorId = new Map(
      usuariosAuth.map((usuario) => [usuario.id, usuario.email ?? '']),
    )
    const usuarios = (perfiles ?? []).map((perfil) => ({
      ...perfil,
      email: correosPorId.get(perfil.id) ?? '',
    }))

    return respuesta({ usuarios }, 200)
  } catch (error) {
    console.error(
      'Error inesperado en admin-listar-usuarios:',
      error instanceof Error ? error.message : error,
    )
    return respuesta({ error: 'Ocurrió un error al cargar los usuarios.' }, 500)
  }
})
