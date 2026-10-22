import {
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import type { Perfil } from '../hooks/AuthContext'

export type PerfilUsuario = Perfil & { created_at: string; email: string }
export type UsuarioCreado = PerfilUsuario & { email: string }
export type NuevoUsuario = Pick<Perfil, 'nombres' | 'apellidos' | 'rol'> & {
  email: string
}

export type CambiosPerfil = Partial<
  Pick<Perfil, 'nombres' | 'apellidos' | 'rol' | 'activo'>
>

async function errorFuncion(error: Error): Promise<Error> {
  if (!(error instanceof FunctionsHttpError || error instanceof FunctionsRelayError)) {
    return error
  }

  try {
    const body: unknown = await error.context.clone().json()
    if (typeof body === 'object' && body !== null) {
      const detalle = 'error' in body ? body.error : 'message' in body ? body.message : null
      if (typeof detalle === 'string' && detalle) return new Error(detalle)
    }
  } catch {
    return new Error(`${error.message} (HTTP ${error.context.status})`)
  }

  return new Error(`${error.message} (HTTP ${error.context.status})`)
}

export async function listarPerfiles(): Promise<PerfilUsuario[]> {
  const { data, error } = await supabase.functions.invoke<{
    usuarios: PerfilUsuario[]
  }>('admin-listar-usuarios', { body: {} })

  if (error) throw await errorFuncion(error)
  if (!data || !Array.isArray(data.usuarios)) {
    throw new Error('No se recibió una lista válida de usuarios.')
  }
  return data.usuarios
}

export async function crearUsuario(
  usuario: NuevoUsuario,
): Promise<UsuarioCreado> {
  const { data, error } = await supabase.functions.invoke<UsuarioCreado>(
    'admin-crear-usuario',
    { body: usuario },
  )

  if (error) throw await errorFuncion(error)
  if (!data) throw new Error('No se recibió la confirmación del nuevo usuario.')

  return data
}

export async function eliminarUsuarioPermanente(id: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ success: boolean }>(
    'admin-eliminar-usuario',
    { body: { userId: id } },
  )

  if (error) throw await errorFuncion(error)
  if (!data?.success) {
    throw new Error('No se recibió confirmación de la eliminación del usuario.')
  }
}

export async function restablecerContrasenaUsuario(id: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ success: boolean }>(
    'admin-restablecer-password',
    { body: { userId: id } },
  )

  if (error) throw await errorFuncion(error)
  if (!data?.success) {
    throw new Error('No se recibió confirmación del envío del enlace.')
  }
}

export async function actualizarCorreoUsuario(
  id: string,
  email: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{
    success: boolean
    email: string
  }>('admin-actualizar-correo', { body: { userId: id, email } })

  if (error) throw await errorFuncion(error)
  if (!data?.success || !data.email) {
    throw new Error('No se recibió confirmación de la actualización del correo.')
  }
  return data.email
}

export async function actualizarPerfil(
  id: string,
  cambios: CambiosPerfil,
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .update(cambios)
    .eq('id', id)
    .select('id')

  if (error) throw error

  // Si RLS no deja actualizar, Supabase no da error: devuelve 0 filas.
  if (!data || data.length === 0) {
    throw new Error('No tienes permiso para modificar este usuario.')
  }
}
