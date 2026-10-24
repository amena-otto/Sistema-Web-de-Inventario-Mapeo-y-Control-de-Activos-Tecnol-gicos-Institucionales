# Sistema Web de Inventario OT

Aplicación React, TypeScript y Vite para administrar el inventario tecnológico
institucional mediante Supabase.

## Inicio local

1. Instala Node.js y las dependencias con `npm install`.
2. Copia `.env.example` a `.env`.
3. Completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` con los datos
   públicos del proyecto Supabase.
4. `VITE_APP_URL` está configurado para desarrollo y producción con el dominio
   público de Workers, así los QR generados localmente también abren la aplicación
   publicada y permiten descargar e imprimir etiquetas.
5. Ejecuta `npm run dev`.

No agregues claves `service_role` ni credenciales administrativas al frontend.
El archivo `.env` está excluido de Git.

## Publicación en Cloudflare Workers

El Worker está configurado en `wrangler.toml` para publicar `dist/` y responder
con la SPA en rutas directas como `/equipos?equipo=<UUID>`. El dominio actual es
`https://sistema-web-de-inventario.amena-f7f.workers.dev`.

Para publicar los cambios:

1. Autentícate con `npx wrangler login`.
2. Ejecuta `npm run build`.
3. Publica con `npx wrangler deploy`.

Si cambia el dominio, actualiza `VITE_APP_URL` en `.env.development`,
`.env.production` y `.env.example`; también actualiza `Site URL`, `Redirect URLs`
y el secreto `APP_URL` de Supabase.

## Configuración de autenticación

- Habilita el proveedor de correo y contraseña en Supabase Auth.
- Las invitaciones aceptan direcciones `@ottotonsmann.edu.pe` y `@gmail.com`
  para facilitar pruebas; ambos dominios se validan en la aplicación y en la
  Edge Function `admin-crear-usuario`.
- Configura la URL del sitio y las URL de redirección permitidas para el
  entorno; incluye `/restablecer-password` para el enlace de recuperación.
  Para producción, `Site URL` debe ser
  `https://sistema-web-de-inventario.amena-f7f.workers.dev` (o el dominio
  personalizado), nunca `localhost`. Añade también
  `https://sistema-web-de-inventario.amena-f7f.workers.dev/restablecer-password`
  a `Redirect URLs`.
- Cada cuenta de Auth debe tener un perfil relacionado por el mismo `id`, con
  un rol válido (`admin`, `tecnico` o `consulta`) y `activo = true`.
- La tabla de usuarios muestra los correos de inicio de sesión mediante la
  Edge Function `admin-listar-usuarios`. Al editar una cuenta, el administrador
  puede cambiar el correo con `admin-actualizar-correo`; el cambio se aplica
  inmediatamente en Supabase Auth y la persona deberá usar el nuevo correo
  para iniciar sesión. Despliega ambas funciones con
  `npx supabase functions deploy admin-listar-usuarios` y
  `npx supabase functions deploy admin-actualizar-correo`.
- El administrador puede invitar personal desde la pantalla de usuarios. La
  función `admin-crear-usuario` verifica la sesión y el perfil de administrador
  activo en el servidor antes de crear la cuenta. Configura el secreto
  `APP_URL` de la Edge Function con el origen público de la aplicación y agrega
  `${APP_URL}/restablecer-password` a las URL de redirección permitidas de Auth.
  Si Supabase devuelve `email rate limit exceeded`, espera el periodo de
  enfriamiento o configura un proveedor SMTP propio en
  **Authentication → SMTP Settings**; no se puede aumentar ese límite desde
  el frontend ni desplegando la función en Cloudflare.
- Desde la edición de un usuario, el administrador puede enviar un enlace de
  restablecimiento al correo de la cuenta. Despliega
  `supabase/functions/admin-restablecer-password` con
  `supabase functions deploy admin-restablecer-password`; la función verifica
  en el servidor que quien solicita sea un administrador activo. El enlace
  necesita que `${APP_URL}/restablecer-password` esté permitida en Auth.
- Las cuentas inactivas solo se eliminan desde la lista de usuarios antiguos,
  después de confirmarlo. Despliega también
  `supabase/functions/admin-eliminar-usuario`; la función solo acepta
  administradores activos y rechaza cuentas que aún estén activas. Despliega
  con `npx supabase functions deploy admin-eliminar-usuario`. Las cuentas con
  referencias históricas no se borran para no perder la trazabilidad; la
  función informa ese caso y conserva la cuenta desactivada.
- Configura el secreto `APP_URL` de las funciones de invitación y
  restablecimiento como
  `https://sistema-web-de-inventario.amena-f7f.workers.dev` (sin `localhost`
  ni `/restablecer-password`).
  Puedes actualizarlo desde **Supabase Dashboard → Edge Functions → Secrets**
  o con `npx supabase secrets set APP_URL=https://sistema-web-de-inventario.amena-f7f.workers.dev`.
  Supabase Auth envía el correo usando su proveedor SMTP configurado; para
  producción se recomienda configurar un SMTP propio en **Authentication →
  SMTP Settings**. No se necesita una API de correo en el frontend.
- La Edge Function usa `SUPABASE_SERVICE_ROLE_KEY` exclusivamente en el
  servidor. Nunca agregues esa clave al frontend ni a variables `VITE_*`.
  El invitado recibe un correo para establecer su contraseña y queda activo
  con el rol que asignó el administrador.

## Roles y límites de seguridad

La matriz de permisos de `src/hooks/usePermissions.ts` es la fuente única para
la visibilidad del menú y la protección de rutas. El frontend mejora la
experiencia, pero no sustituye la autorización del servidor.

Las políticas RLS de todas las tablas expuestas y las políticas del bucket de
fotografías deben configurarse y verificarse en Supabase. Esas políticas son
las que deben impedir operaciones no autorizadas también al llamar la API
directamente. La auditoría del usuario responsable y la aplicación efectiva de
los estados de cuenta dependen de las funciones y políticas de base de datos.

No se deben guardar contraseñas Wi-Fi, credenciales administrativas ni otros
secretos en las fichas de inventario.

## Módulos de inventario y mapeo

- El Dashboard presenta indicadores reales del inventario, distribución de
  equipos por laboratorio, situación operativa, bajas e intervenciones de
  mantenimiento. Los datos de mantenimiento solo se consultan para perfiles
  autorizados por las políticas RLS. La navegación aplica el diseño
  institucional del IES Privado Otto Tonsmann.

- En Supabase SQL Editor, ejecuta en orden y una sola vez:
  `supabase/migrations/004_modulo_inventario.sql` y después
  `supabase/migrations/005_mapeo_institucional.sql`. Si deseas permitir que el
  administrador elimine ubicaciones vacías desde la aplicación, ejecuta
  también `supabase/migrations/006_eliminar_ubicaciones.sql`. La migración 005
  crea la estructura inicial de pabellones A-D y pisos; también incorpora un
  laboratorio de cómputo en los pisos 1 y 2 del pabellón C.
- La migración 004 añade patrimonio, posición, responsable y vencimiento de
  garantía; habilita el código secuencial `OT-EQP-000001` y el estado
  `en_almacen`. La baja es lógica y está reservada al administrador. El código
  institucional no se edita ni cambia al trasladar un equipo.
- En Equipos se pueden registrar/editar activos, consultar detalle, filtrar y
  paginar; las características técnicas se guardan en `componentes`. CPU,
  monitor y periféricos son activos independientes asociados desde el detalle.
- Cada fila de Equipos permite abrir y descargar una etiqueta QR en PNG, o
  imprimirla individualmente. El enlace usa el UUID del equipo en
  `/equipos?equipo=<UUID>`; esa ruta abre la ficha existente y requiere
  autenticación y permiso de inventario. Las etiquetas oficiales requieren
  `VITE_APP_URL` configurado al dominio HTTPS publicado. `wrangler.toml`
  habilita la resolución SPA de rutas directas en Cloudflare Workers. La
  impresión por lote queda como mejora posterior; actualmente se imprimen
  etiquetas individuales.
- La importación CSV usa la plantilla descargable, admite hasta 500 filas y
  comunica errores por fila. Admite separadores coma, punto y coma o tabulación,
  codificaciones UTF-8/UTF-16/Windows-1252, y normaliza mayúsculas y tildes al
  buscar categorías. Categorías y códigos de ambiente deben existir previamente;
  las columnas vacías finales o faltantes de una fila se toleran.
- La exportación CSV descarga todos los equipos que coinciden con la búsqueda y
  filtros actuales, con sus nombres de categoría y código de ambiente. El
  archivo se genera desde la tabla de equipos en lotes, no solo desde la página
  visible.
- Las fotografías se optimizan antes de almacenarse. La migración
  `supabase/migrations/007_fotografias_google_drive.sql` agrega soporte para
  fotos nuevas en Google Drive sin invalidar las rutas ya guardadas en
  Supabase Storage. La Edge Function `fotografias-drive` usa la autorización
  OAuth almacenada y los secretos OAuth ya configurados en Supabase; no usa
  credenciales de cuenta de servicio. Admin y técnico pueden cargar fotografías,
  reemplazar la principal, elegir cuál es principal y eliminar imágenes desde
  la ficha del equipo. Consulta solo puede visualizarlas. `tipo='principal'`
  identifica la foto principal y `tipo='adicional'` las demás. Al cambiar la
  Edge Function, vuelve a desplegarla con el comando `supabase functions deploy fotografias-drive`.
  Las rutas existentes de Supabase Storage siguen siendo compatibles.
- Ubicaciones permite administrar pabellones, pisos y ambientes, corregir sus
  datos y eliminar solo los que no tengan dependencias. Los pisos con ambientes
  y los ambientes con equipos deben vaciarse o reasignarse antes de borrarlos.
  Los equipos se consultan por jerarquía y se resumen por estado.
  Los planos de piso se optimizan y guardan en un bucket privado. Los
  marcadores usan coordenadas normalizadas ligadas al equipo; al mover un
  activo a otro piso se elimina su marcador antiguo para volver a ubicarlo en
  el plano correcto.
- La migración 005 añade la tabla de marcadores y activa los cambios en tiempo
  real para que el mapa refleje traslados de equipos.
- Para habilitar el historial y formulario de mantenimiento, ejecuta en orden
  `supabase/migrations/008_modulo_mantenimientos.sql` y
  `supabase/migrations/009_tecnicos_activos_mantenimiento.sql`. Después
  despliega la aplicación. Solo los técnicos y administradores activos aparecen
  como opciones; los nombres de inactivos se conservan para leer el historial.
- Para habilitar traslados y cambios de responsables con historial, ejecuta
  `supabase/migrations/010_control_movimientos.sql`. La pantalla Movimientos
  registra ubicación, posición y responsable anterior y nuevo, motivo, fecha y
  usuario actor; actualiza la ficha del equipo dentro de la misma transacción.
  Las asignaciones no se pueden cambiar desde la edición ordinaria del equipo,
  y la base de datos impide esos cambios si no existe su movimiento asociado.
  El historial se consulta de forma cronológica y no admite edición o borrado
  desde el cliente.

## Verificación

- `npm run build`: comprueba TypeScript y genera la aplicación de producción.
- `npm run lint`: ejecuta ESLint.
