import type { Perfil } from './AuthContext'
import { useAuth } from './useAuth'

type Rol = Perfil['rol']

const permisos = {
  'inventario.ver': ['admin', 'tecnico', 'consulta'],
  'equipos.crear': ['admin', 'tecnico'],
  'equipos.editar': ['admin', 'tecnico'],
  'equipos.baja': ['admin'],
  'ubicaciones.administrar': ['admin'],
  'categorias.administrar': ['admin'],
  'mantenimientos.ver': ['admin', 'tecnico'],
  'mantenimientos.registrar': ['admin', 'tecnico'],
  'movimientos.ver': ['admin', 'tecnico'],
  'movimientos.registrar': ['admin', 'tecnico'],
  'reportes.ver': ['admin', 'tecnico', 'consulta'],
  'usuarios.administrar': ['admin'],
  'auditoria.ver': ['admin'],
} as const satisfies Record<string, readonly Rol[]>

export type Permiso = keyof typeof permisos

export function usePermissions() {
  const { perfil } = useAuth()

  const can = (permiso: Permiso) =>
    !!perfil && (permisos[permiso] as readonly Rol[]).includes(perfil.rol)

  return { can, rol: perfil?.rol ?? null }
}
