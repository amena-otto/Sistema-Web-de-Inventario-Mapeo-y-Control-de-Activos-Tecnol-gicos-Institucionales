# Configuración de autenticación

El frontend usa Supabase Auth con proveedor de correo y contraseña. La configuración pública se entrega mediante variables de entorno de Vite; las credenciales administrativas permanecen solo en Edge Functions.

## Configuración de Auth

- La creación de usuarios y el cambio de correo aceptan cualquier dirección válida. El formato se valida en la aplicación y en las Edge Functions `admin-crear-usuario` y `admin-actualizar-correo`.
- Configura `Site URL` y las URL de redirección permitidas. En producción, `Site URL` debe ser `https://sistema-web-de-inventario.amena-f7f.workers.dev` (o el dominio personalizado), nunca `localhost`. Incluye `https://sistema-web-de-inventario.amena-f7f.workers.dev/restablecer-password` en `Redirect URLs`.
- Cada cuenta de Auth debe tener un perfil relacionado por el mismo `id`, con rol válido (`admin`, `tecnico` o `consulta`) y `activo = true`.
- Las cuentas inactivas no pueden iniciar sesión. Los permisos de interfaz no sustituyen a las políticas RLS ni a las funciones que comprueban el rol activo.
- No guardes contraseñas Wi-Fi, credenciales administrativas ni otros secretos en las fichas de inventario.

Si cambia el dominio publicado, actualiza `VITE_APP_URL` en `.env.development`, `.env.production` y `.env.example`, además de `Site URL`, `Redirect URLs` y el secreto `APP_URL` de Supabase.

## Variables del frontend

`.env.example` define tres variables:

- `VITE_SUPABASE_URL`: URL del proyecto Supabase.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: clave pública del proyecto.
- `VITE_APP_URL`: origen HTTPS publicado, sin rutas ni parámetros. Se usa para construir los enlaces de las etiquetas QR.

`.env` no debe versionarse. Los flujos de CI usan valores ficticios para compilar y no contienen secretos de producción.

## Edge Functions

Las funciones de usuario y soporte se encuentran en `supabase/functions/`:

- `admin-crear-usuario`
- `admin-listar-usuarios`
- `admin-actualizar-correo`
- `admin-restablecer-password`
- `admin-eliminar-usuario`
- `enviar-correo`
- `google-drive-oauth-callback`
- `fotografias-drive`
- `admin-eliminar-equipo`
- `smooth-api`

Las funciones administrativas validan el token y el perfil activo con rol `admin`. La creación de usuarios, el cambio de correo y el restablecimiento de contraseña pasan por esas funciones; la interfaz no maneja claves `service_role`.

- La lista de usuarios muestra los correos de inicio de sesión mediante `admin-listar-usuarios`. Un administrador puede cambiar el correo con `admin-actualizar-correo`; el cambio se aplica de inmediato en Auth y la persona debe usar el correo nuevo. Despliega ambas funciones con `npx supabase functions deploy admin-listar-usuarios` y `npx supabase functions deploy admin-actualizar-correo`.
- La invitación desde la pantalla de usuarios usa `admin-crear-usuario`, que verifica la sesión y el perfil de administrador activo en el servidor. El secreto `APP_URL` debe contener el origen público de la aplicación y `${APP_URL}/restablecer-password` debe estar permitido en Auth.
- Para enviar un enlace de restablecimiento se usa `supabase/functions/admin-restablecer-password`, desplegada con `supabase functions deploy admin-restablecer-password`. La función comprueba en el servidor que quien solicita sea administrador activo.
- Las cuentas inactivas solo se eliminan desde la lista de usuarios antiguos, después de confirmarlo. `admin-eliminar-usuario` se despliega con `npx supabase functions deploy admin-eliminar-usuario`, solo acepta administradores activos y rechaza cuentas que aún están activas. Las cuentas con referencias históricas se conservan desactivadas para no perder trazabilidad; la función informa ese caso.
- Si Auth responde `email rate limit exceeded`, espera el periodo de enfriamiento o configura un proveedor SMTP propio en **Authentication → SMTP Settings**. Ese límite no puede aumentarse desde el frontend ni desplegando la función en Cloudflare.

`supabase/config.toml` declara `enviar-correo` con `verify_jwt = true` y su mapa de importaciones. El secreto `APP_URL` de invitación y restablecimiento se configura como `https://sistema-web-de-inventario.amena-f7f.workers.dev`, sin `localhost` ni `/restablecer-password`, desde **Supabase Dashboard → Edge Functions → Secrets** o con `npx supabase secrets set APP_URL=https://sistema-web-de-inventario.amena-f7f.workers.dev`. Para producción se recomienda un SMTP propio; no se necesita una API de correo en el frontend.

Las Edge Functions usan `SUPABASE_SERVICE_ROLE_KEY` únicamente en el servidor. Nunca agregues esa clave al frontend ni a variables `VITE_*`. Los secretos SMTP, de Google Drive y `service_role` se configuran en el entorno de Supabase, nunca en el repositorio ni en el Worker. El invitado recibe un correo para establecer su contraseña y queda activo con el rol asignado por el administrador.

## Sesión y rutas

Las rutas protegidas exigen sesión y perfil activo, y aplican la matriz de permisos; un rol sin permiso vuelve a `/dashboard`. `/` y las rutas inexistentes redirigen a `/login`; el panel está en `/dashboard`. El retorno posterior al inicio de sesión se limita a rutas internas seguras y excluye `/`, `/login`, `/restablecer-password` y orígenes externos.

El perfil se revalida al navegar, al recuperar foco o visibilidad y cada 60 segundos, con un mínimo de 30 segundos entre consultas. Si la cuenta está desactivada o fue eliminada, se limpia el perfil local, se cierra la sesión local y se redirige a `/login` con un mensaje.

## Puntos de validación

- No colocar `service_role`, contraseñas SMTP ni credenciales de Drive en archivos versionados.
- Confirmar que las URL de redirección de Auth apuntan al dominio publicado.
- Verificar que `VITE_APP_URL` sea solo el origen HTTPS para que los QR no apunten a `localhost`.
- Verificar las políticas RLS de todas las tablas expuestas y del bucket de fotografías, también al llamar a la API directamente.
- Comprobar que la auditoría del usuario responsable y la aplicación efectiva del estado de las cuentas dependan de las funciones y políticas de base de datos.
- Probar con cuentas activas de cada rol antes de publicar cambios de autenticación.

La secuencia de publicación se describe en [publicación y operaciones](./despliegue.md).
