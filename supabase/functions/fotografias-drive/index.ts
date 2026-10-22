import { createClient } from 'npm:@supabase/supabase-js@2'

const driveScope = 'https://www.googleapis.com/auth/drive'
const googleTokenUrl = 'https://oauth2.googleapis.com/token'

type ServiceAccountCredentials = {
  type?: string
  client_email?: string
  private_key?: string
  private_key_id?: string
}

function esObjeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function encodeBase64Url(value: Uint8Array | string): string {
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value) : value
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function decodePrivateKey(pem: string): Uint8Array {
  const normalized = pem.replace(/\\r\\n|\\n|\\r/g, '\n').trim()
  if (
    !normalized.startsWith('-----BEGIN PRIVATE KEY-----') ||
    !normalized.endsWith('-----END PRIVATE KEY-----')
  ) {
    throw new Error(
      'La clave privada no tiene el formato esperado. Usa el JSON de clave de una cuenta de servicio de Google.',
    )
  }
  const contents = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  if (!contents) throw new Error('La clave privada de Google está vacía.')
  const binary = atob(contents)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function mensajeErrorOAuth(response: Response): Promise<string> {
  let code = ''
  let description = ''
  try {
    const body: unknown = await response.json()
    if (esObjeto(body)) {
      if (typeof body.error === 'string') code = body.error
      if (typeof body.error_description === 'string') {
        description = body.error_description
      }
    }
  } catch {
    description = 'Google devolvió una respuesta que no se pudo interpretar.'
  }

  const detalle = [
    `Google OAuth respondió HTTP ${response.status}`,
    code,
    description,
  ]
    .filter(Boolean)
    .join(': ')
  console.error(detalle)
  return detalle
}

async function getGoogleAccessToken(): Promise<string> {
  const secret = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!secret) {
    throw new Error('Falta el secreto GOOGLE_SERVICE_ACCOUNT_JSON en Supabase.')
  }

  let credentials: ServiceAccountCredentials
  try {
    let parsed: unknown = JSON.parse(secret.trim())
    if (typeof parsed === 'string') parsed = JSON.parse(parsed)
    if (!esObjeto(parsed)) throw new Error('El contenido no es un objeto JSON.')

    credentials = {
      type: typeof parsed.type === 'string' ? parsed.type : undefined,
      client_email:
        typeof parsed.client_email === 'string' ? parsed.client_email : undefined,
      private_key:
        typeof parsed.private_key === 'string' ? parsed.private_key : undefined,
      private_key_id:
        typeof parsed.private_key_id === 'string'
          ? parsed.private_key_id
          : undefined,
    }
  } catch {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON debe contener el JSON completo descargado de una clave de cuenta de servicio de Google Cloud, sin texto adicional.',
    )
  }
  if (
    credentials.type !== 'service_account' ||
    !credentials.client_email?.endsWith('.iam.gserviceaccount.com') ||
    !credentials.private_key
  ) {
    throw new Error(
      'El secreto debe ser una clave JSON de tipo service_account con client_email y private_key. No uses un OAuth client ID ni una API key.',
    )
  }

  const now = Math.floor(Date.now() / 1000)
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    ...(credentials.private_key_id ? { kid: credentials.private_key_id } : {}),
  }
  const claims = {
    iss: credentials.client_email,
    scope: driveScope,
    aud: googleTokenUrl,
    iat: now,
    exp: now + 3600,
  }
  const unsignedToken = `${encodeBase64Url(JSON.stringify(header))}.${encodeBase64Url(JSON.stringify(claims))}`
  let privateKey: CryptoKey
  try {
    privateKey = await crypto.subtle.importKey(
      'pkcs8',
      decodePrivateKey(credentials.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes('formato esperado')) {
      throw error
    }
    throw new Error(
      'No se pudo leer private_key. Vuelve a descargar una clave JSON nueva para la cuenta de servicio de Google Cloud y actualiza el secreto.',
      { cause: error },
    )
  }
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(unsignedToken),
  )
  const assertion = `${unsignedToken}.${encodeBase64Url(new Uint8Array(signature))}`
  const response = await fetch(googleTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!response.ok) {
    throw new Error(await mensajeErrorOAuth(response))
  }

  const result: unknown = await response.json()
  if (
    typeof result !== 'object' ||
    result === null ||
    !('access_token' in result) ||
    typeof result.access_token !== 'string'
  ) {
    throw new Error('Google no devolvió un token de acceso válido.')
  }
  return result.access_token
}

async function mensajeErrorGoogle(response: Response): Promise<string> {
  const responseText = await response.text()
  let message = 'Google no proporcionó detalles adicionales.'
  let reason = ''

  try {
    const parsed: unknown = JSON.parse(responseText)
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
      const error = parsed.error
      if (typeof error === 'object' && error !== null) {
        if ('message' in error && typeof error.message === 'string') {
          message = error.message
        }
        if (
          'errors' in error &&
          Array.isArray(error.errors) &&
          typeof error.errors[0]?.reason === 'string'
        ) {
          reason = error.errors[0].reason
        }
      } else if (typeof error === 'string') {
        message = error
      }
    }
  } catch {
    message = 'La respuesta de Google no tenía el formato esperado.'
  }

  const detalle = `Google Drive respondió HTTP ${response.status}: ${message}${reason ? ` (${reason})` : ''}`
  console.error(detalle)
  return detalle
}

async function validarCarpetaDrive(
  accessToken: string,
  folderId: string,
): Promise<void> {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}`,
  )
  url.searchParams.set('fields', 'id,name,mimeType,capabilities(canAddChildren)')
  url.searchParams.set('supportsAllDrives', 'true')
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new Error(await mensajeErrorGoogle(response))
  }

  const folder: unknown = await response.json()
  if (
    typeof folder !== 'object' ||
    folder === null ||
    !('mimeType' in folder) ||
    folder.mimeType !== 'application/vnd.google-apps.folder'
  ) {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID no corresponde a una carpeta de Drive.')
  }
  if (
    'capabilities' in folder &&
    typeof folder.capabilities === 'object' &&
    folder.capabilities !== null &&
    'canAddChildren' in folder.capabilities &&
    folder.capabilities.canAddChildren === false
  ) {
    throw new Error('La cuenta de servicio puede ver la carpeta, pero no agregar archivos.')
  }
}

async function subirArchivoDrive(
  accessToken: string,
  folderId: string,
  file: File,
): Promise<string> {
  const boundary = `drive_${crypto.randomUUID().replace(/-/g, '')}`
  const metadata = {
    name: `equipo-${crypto.randomUUID()}.jpg`,
    parents: [folderId],
    mimeType: file.type,
  }
  const body = new Blob(
    [
      `--${boundary}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\n`,
      `Content-Type: ${file.type}\r\n\r\n`,
      file,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  )
  const url = new URL('https://www.googleapis.com/upload/drive/v3/files')
  url.searchParams.set('uploadType', 'multipart')
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('fields', 'id')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  if (!response.ok) {
    throw new Error(await mensajeErrorGoogle(response))
  }

  const result: unknown = await response.json()
  if (
    typeof result !== 'object' ||
    result === null ||
    !('id' in result) ||
    typeof result.id !== 'string'
  ) {
    throw new Error('Google Drive no devolvió el identificador del archivo.')
  }
  return result.id
}

async function borrarArchivoDrive(
  accessToken: string,
  fileId: string,
): Promise<void> {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
  )
  url.searchParams.set('supportsAllDrives', 'true')
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok && response.status !== 404) {
    console.error('No se pudo limpiar el archivo huérfano de Drive:', response.status)
  }
}

async function descargarArchivoDrive(
  accessToken: string,
  fileId: string,
): Promise<Response> {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
  )
  url.searchParams.set('alt', 'media')
  url.searchParams.set('supportsAllDrives', 'true')
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    console.error('Google Drive rechazó la descarga:', response.status)
    throw new Error('No se pudo recuperar la fotografía de Google Drive.')
  }
  return response
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const rolesLectura = ['admin', 'tecnico', 'consulta']
const rolesSubida = ['admin', 'tecnico']
const tiposImagen = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maximoBytes = 2 * 1024 * 1024
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

function respuestaJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function obtenerClientes(request: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new HttpError('La función no tiene configuradas las credenciales de Supabase.', 500)
  }
  if (!token) throw new HttpError('Se requiere una sesión autenticada.', 401)

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return { authClient, adminClient, token }
}

async function validarPerfil(
  request: Request,
  rolesPermitidos: string[],
) {
  const { authClient, adminClient, token } = obtenerClientes(request)
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) {
    throw new HttpError('La sesión no es válida o ha expirado.', 401)
  }

  const { data: perfil, error: perfilError } = await adminClient
    .from('profiles')
    .select('rol, activo')
    .eq('id', data.user.id)
    .maybeSingle()
  if (perfilError) {
    console.error('No se pudo verificar el perfil que solicita la fotografía:', perfilError.message)
    throw new HttpError('No se pudo verificar el permiso del usuario.', 500)
  }
  if (!perfil?.activo || !rolesPermitidos.includes(perfil.rol)) {
    throw new HttpError('Tu cuenta no tiene permiso para esta operación.', 403)
  }

  return { adminClient, userId: data.user.id }
}

async function subirFotografia(request: Request) {
  const { adminClient, userId } = await validarPerfil(request, rolesSubida)
  const formData = await request.formData()
  const fileValue = formData.get('file')
  const equipoIdValue = formData.get('equipoId')
  if (!(fileValue instanceof File) || typeof equipoIdValue !== 'string') {
    return respuestaJson({ error: 'Selecciona una imagen y un equipo válidos.' }, 400)
  }
  if (!uuidPattern.test(equipoIdValue)) {
    return respuestaJson({ error: 'El identificador del equipo no es válido.' }, 400)
  }
  if (!tiposImagen.has(fileValue.type) || fileValue.size === 0) {
    return respuestaJson({ error: 'La fotografía debe ser JPG, PNG o WebP.' }, 400)
  }
  if (fileValue.size > maximoBytes) {
    return respuestaJson({ error: 'La fotografía supera el límite de 2 MB.' }, 400)
  }

  const { data: equipo, error: equipoError } = await adminClient
    .from('equipos')
    .select('id')
    .eq('id', equipoIdValue)
    .eq('situacion', 'activo')
    .maybeSingle()
  if (equipoError) {
    console.error('No se pudo verificar el equipo de la fotografía:', equipoError.message)
    throw new Error('No se pudo verificar el equipo.')
  }
  if (!equipo) return respuestaJson({ error: 'El equipo no existe o está dado de baja.' }, 404)

  const folderId = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID')
  if (!folderId) {
    console.error('Falta configurar GOOGLE_DRIVE_FOLDER_ID.')
    throw new Error('El almacenamiento de fotografías no está configurado.')
  }

  const accessToken = await getGoogleAccessToken()
  await validarCarpetaDrive(accessToken, folderId)
  const driveFileId = await subirArchivoDrive(accessToken, folderId, fileValue)
  const { error: registroError } = await adminClient
    .from('fotografias_equipos')
    .insert({
      equipo_id: equipoIdValue,
      drive_file_id: driveFileId,
      ruta_storage: null,
      tipo: 'principal',
      creado_por: userId,
    })

  if (registroError) {
    console.error('No se pudo registrar la fotografía de Drive:', registroError.message)
    await borrarArchivoDrive(accessToken, driveFileId)
    throw new Error('La fotografía se subió, pero no se pudo vincular al equipo.')
  }

  return respuestaJson({ success: true }, 201)
}

async function obtenerFotografia(request: Request) {
  const { adminClient } = await validarPerfil(request, rolesLectura)
  const photoId = new URL(request.url).searchParams.get('id')
  if (!photoId || !uuidPattern.test(photoId)) {
    return respuestaJson({ error: 'El identificador de la fotografía no es válido.' }, 400)
  }

  const { data: fotografia, error } = await adminClient
    .from('fotografias_equipos')
    .select('drive_file_id')
    .eq('id', photoId)
    .maybeSingle()
  if (error) {
    console.error('No se pudo buscar la fotografía:', error.message)
    throw new Error('No se pudo buscar la fotografía.')
  }
  if (!fotografia?.drive_file_id) {
    return respuestaJson({ error: 'No se encontró la fotografía de Drive.' }, 404)
  }

  const driveResponse = await descargarArchivoDrive(
    await getGoogleAccessToken(),
    fotografia.drive_file_id,
  )
  const contentType = driveResponse.headers.get('Content-Type')?.split(';')[0]
  if (!contentType || !tiposImagen.has(contentType)) {
    throw new Error('El archivo vinculado no es una imagen admitida.')
  }

  return new Response(driveResponse.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': contentType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (request.method === 'POST') return await subirFotografia(request)
    if (request.method === 'GET') return await obtenerFotografia(request)
    return respuestaJson({ error: 'Método no permitido.' }, 405)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
    const status = error instanceof HttpError ? error.status : 500
    if (status === 500) console.error('Error en fotografías de Drive:', message)
    return respuestaJson({ error: message }, status)
  }
})
