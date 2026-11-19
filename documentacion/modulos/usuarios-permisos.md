# Usuarios y permisos

El acceso se basa en cuentas de Supabase Auth y perfiles almacenados en `public.profiles`. Cada perfil tiene nombres, apellidos, correo, rol (`admin`, `tecnico` o `consulta`) y estado activo o inactivo.

## Roles

| Rol | Alcance principal |
|---|---|
| Administrador (`admin`) | Usuarios, ubicaciones, categorías, baja de equipos, auditoría y resto de operaciones. |
| Técnico (`tecnico`) | Alta y edición de equipos, mantenimientos y movimientos; consulta de historiales. |
| Consulta (`consulta`) | Lectura del inventario y de reportes. |

La matriz efectiva de la interfaz se define en `usePermissions`:

- `inventario.ver`: administrador, técnico, consulta.
- `equipos.crear` y `equipos.editar`: administrador, técnico.
- `equipos.baja`, `ubicaciones.administrar`, `categorias.administrar`, `usuarios.administrar` y `auditoria.ver`: administrador.
- `mantenimientos.ver`, `mantenimientos.registrar`, `movimientos.ver` y `movimientos.registrar`: administrador, técnico.
- `reportes.ver`: administrador, técnico, consulta.

Estos permisos controlan la visibilidad de botones y opciones. Las acciones sensibles además se validan en base de datos mediante RLS y funciones `security definer` que comprueban el rol activo.

## Gestión de usuarios

La pantalla **Usuarios** permite:

- crear una cuenta indicando correo válido, nombres, apellidos, contraseña inicial y rol;
- buscar por nombre o correo y filtrar por rol;
- alternar entre cuentas activas y antiguas;
- editar nombres y apellidos, y cambiar el rol de otros usuarios;
- cambiar el correo de acceso previa confirmación;
- enviar un enlace para restablecer la contraseña al correo asociado;
- desactivar y reactivar cuentas;
- eliminar permanentemente una cuenta solo después de desactivarla.

No es posible cambiar el propio rol desde la edición, ni desactivar la propia cuenta. Las contraseñas iniciales deben cumplir la política definida en `passwordPolicy.ts`.

Los usuarios inactivos no pueden iniciar sesión. Si se les envía un enlace de restablecimiento, el sistema avisa de que la cuenta sigue inactiva y debe reactivarse. La eliminación permanente solicita confirmación y no puede deshacerse.

## Consideraciones de seguridad

- El rol y el estado se consultan desde el perfil autenticado; una cuenta inactiva deja de satisfacer las comprobaciones de rol en las funciones protegidas.
- Las tablas de auditoría y evidencia son de solo lectura desde la API; la escriben funciones protegidas.
- La RPC de baja definitiva solo la puede invocar `service_role` desde la Edge Function.
- Los permisos de frontend no sustituyen a RLS: ambos deben mantenerse coherentes.

## Fuentes

- `src/pages/Usuarios.tsx`
- `src/hooks/usePermissions.ts`
- `src/hooks/AuthContext.tsx`
- `src/services/usuariosService.ts`
- `src/services/passwordPolicy.ts`
- `supabase/migrations/001_endurecer_permisos_rls.sql`
- `supabase/migrations/003_usuariosyfotos.sql`
