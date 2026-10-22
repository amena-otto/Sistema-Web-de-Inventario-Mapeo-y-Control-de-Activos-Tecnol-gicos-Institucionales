import {
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import type { Perfil } from '../hooks/AuthContext'

export type PerfilUsuario = Perfil & { created_at: string }
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
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nombres, apellidos, rol, activo, created_at')
    .order('apellidos')

  if (error) throw error
  return (data ?? []) as PerfilUsuario[]
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
