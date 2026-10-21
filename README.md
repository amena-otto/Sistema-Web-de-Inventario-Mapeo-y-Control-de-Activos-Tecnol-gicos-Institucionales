# Sistema Web de Inventario OT

Aplicación React, TypeScript y Vite para administrar el inventario tecnológico
institucional mediante Supabase.

## Inicio local

1. Instala Node.js y las dependencias con `npm install`.
2. Copia `.env.example` a `.env`.
3. Completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` con los datos
   públicos del proyecto Supabase.
4. Ejecuta `npm run dev`.

No agregues claves `service_role` ni credenciales administrativas al frontend.
El archivo `.env` está excluido de Git.

## Configuración de autenticación

- Habilita el proveedor de correo y contraseña en Supabase Auth.
- Configura la URL del sitio y las URL de redirección permitidas para el
  entorno; incluye `/restablecer-password` para el enlace de recuperación.
- Cada cuenta de Auth debe tener un perfil relacionado por el mismo `id`, con
  un rol válido (`admin`, `tecnico` o `consulta`) y `activo = true`.
- El administrador puede invitar personal desde la pantalla de usuarios. La
  función `admin-crear-usuario` verifica la sesión y el perfil de administrador
  activo en el servidor antes de crear la cuenta. Configura el secreto
  `APP_URL` de la Edge Function con el origen público de la aplicación y agrega
  `${APP_URL}/restablecer-password` a las URL de redirección permitidas de Auth.
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

## Verificación

- `npm run build`: comprueba TypeScript y genera la aplicación de producción.
- `npm run lint`: ejecuta ESLint.
