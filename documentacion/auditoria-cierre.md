# Auditoría de cierre: inventario, seguridad y entrega

**Fecha:** 25 de octubre de 2026
**Alcance:** repositorio completo (frontend, migraciones 001–013, RLS, Edge Functions, CI, respaldos, módulo de mantenimientos y documentación).
**Método:** inspección estática, ejecución de validaciones locales y revisión de documentación. Las pruebas que crean o modifican datos quedan reservadas a staging.

> Este informe no sustituye la evidencia de una ejecución real en staging. Cada criterio indica si está verificado por inspección, ejecutado localmente o pendiente.

## A. Resumen ejecutivo

Se auditaron los flujos de acceso, la baja definitiva de equipos, la conservación de perfiles históricos, la inmutabilidad de la auditoría, RLS, respaldos, CI y documentación. Se corrigieron dos defectos críticos:

1. La ruta `/` renderizaba el panel sin pasar por `/login`.
2. Un usuario desactivado con sesión abierta seguía operando hasta recargar la página.

Además se corrigió el cierre de sesión por acceso revocado, el manejo de errores de la baja definitiva, el filtrado de equipos dados de baja y se limpiaron dependencias sin uso.

**Estado:** el repositorio compila, pasa lint y verifica los tipos de las 10 Edge Functions. **No se declara apto para producción** hasta completar las pruebas de staging, la restauración de respaldos y la aplicación de las migraciones 011–013.

## B. Matriz de requisitos base (RB-01…RB-12)

Los códigos RB/CA no existían en el repositorio; se reconstruyeron a partir de los requisitos de la auditoría y se declaran aquí como definición formal.

| Código | Requisito | Prioridad | Estado |
|---|---|---|---|
| RB-01 | `/` redirige siempre a `/login`, sin bucles; el panel principal vive en `/dashboard` | CRÍTICO | Corregido |
| RB-02 | Toda ruta protegida exige sesión y perfil activo; los permisos redirigen a un destino seguro | CRÍTICO | Corregido |
| RB-03 | Usuario inactivo o eliminado con sesión abierta: bloqueo, limpieza de datos sensibles, cierre local, redirección y mensaje, sin consultas por render | CRÍTICO | Implementado; prueba real pendiente |
| RB-04 | La baja definitiva conserva constancia y auditoría, y limpia el historial operativo solo para un admin activo | CRÍTICO | Implementado; staging pendiente |
| RB-05 | Se conservan perfiles y referencias históricas de usuarios dados de baja | ALTO | Sin defecto |
| RB-06 | RLS y permisos impiden operaciones no autorizadas, incluso con llamadas directas a la API | CRÍTICO | Definido; ejecución pendiente en staging |
| RB-07 | La auditoría es inmutable (sin UPDATE/DELETE) | ALTO | Implementado; staging pendiente |
| RB-08 | Ningún secreto (`service_role`, SMTP, Drive, R2) vive en el repositorio ni en el frontend | CRÍTICO | Verificado |
| RB-09 | Existe respaldo externo cifrado y procedimiento de restauración documentado | ALTO | Documentado; ejecución pendiente |
| RB-10 | CI valida lint, build y tipos de las Edge Functions | MEDIO | Implementado |
| RB-11 | El esquema es reproducible desde el repositorio (baseline) | ALTO | Pendiente: requiere dump del proyecto |
| RB-12 | Los cambios son mínimos, reversibles y sin cambiar arquitectura ni proveedor | ALTO | Cumplido |

## C. Matriz de criterios de aceptación (CA-01…CA-16)

| Código | Criterio de aceptación | Verificación | Evidencia | Estado |
|---|---|---|---|---|
| CA-01 | Sin sesión, `/` termina en `/login` | Estática y manual | Ruta `/` en `src/App.tsx` | Estático; manual pendiente |
| CA-02 | Con sesión, `/` pasa por `/login` y llega a `/dashboard` sin bucle | Estática | `App.tsx` y `Login.tsx` | Estático; manual pendiente |
| CA-03 | Una URL inexistente pasa por `/login` y no genera bucle | Estática | Wildcard `*` hacia `/login` | Estático; manual pendiente |
| CA-04 | El login no retorna a `/`, `/login`, `/restablecer-password` ni a un origen externo | Estática | `rutaRetornoSegura` en `Login.tsx` | Estático |
| CA-05 | Un rol sin permiso termina en `/dashboard` | Estática | `RutaPorPermiso` en `App.tsx` | Estático; manual pendiente |
| CA-06 | Las rutas protegidas exigen sesión y perfil | Estática | `RutaProtegida` en `App.tsx` | Estático |
| CA-07 | Cuenta desactivada con sesión abierta: mensaje, bloqueo y retorno a login | Staging | Pendiente | Pendiente |
| CA-08 | Usuario eliminado en Auth con sesión abierta: mismo comportamiento | Staging | Pendiente | Pendiente |
| CA-09 | Se limpia el perfil y se cierra solo la sesión local | Inspección | `cerrarSesionLocal` y `setResultado(null)` | Inspección; staging pendiente |
| CA-10 | No hay consultas de perfil por render; mínimo 30 s entre consultas e intervalo de 60 s | Inspección | `verificarAcceso` y efectos en `AuthContext.tsx` | Inspección |
| CA-11 | La baja definitiva deja constancia en `equipos_eliminados` y conserva la auditoría | RLS en staging | Migración 011 y `supabase/tests/rls.sql` | Pendiente |
| CA-12 | Solo un admin activo y solo `service_role` pueden purgar | Inspección y RLS | Edge Function `admin-eliminar-equipo` y `grant` de la RPC | Inspección; staging pendiente |
| CA-13 | Perfiles históricos conservados y error `23503` comunicado | Inspección y staging | `admin-eliminar-usuario` | Inspección; staging pendiente |
| CA-14 | La auditoría rechaza UPDATE y DELETE | RLS en staging | Trigger `proteger_auditoria` | Inspección; staging pendiente |
| CA-15 | Lint, build y `deno check` en verde | Ejecutada | Salidas de comandos de la sección E | Ejecutado |
| CA-16 | Respaldo cifrado y restauración documentados | Documental | Workflow de respaldo y fase 11 | Documentado; ejecución pendiente |

**Leyenda:** cumple con evidencia · definido, falta evidencia real · pendiente de staging o manual.

## D. Hallazgos y correcciones

| # | Hallazgo | Criticidad | Estado |
|---|---|---|---|
| 1 | `/` renderizaba el Dashboard a usuarios autenticados; no redirigía a `/login` | CRÍTICO | Corregido: Dashboard en `/dashboard` y `/` hacia `/login` |
| 2 | `RutaPorPermiso` y `Login` usaban `/` como destino, lo que habría creado un bucle | CRÍTICO | Corregido: fallback a `/dashboard` y exclusiones en el retorno |
| 3 | Un usuario desactivado seguía operando en la interfaz hasta recargar | CRÍTICO | Corregido: revalidación con throttle, limpieza y cierre local |
| 4 | El cierre por acceso revocado no garantizaba limpieza local si fallaba la red | ALTO | Corregido: `signOut({ scope: 'local' })` y limpieza de perfil |
| 5 | Baja definitiva: constancia, auditoría, limpieza de archivos y RPC solo `service_role` | Sin defecto | No se reescribió |
| 6 | Perfiles históricos y FK restrictiva con error `23503` comunicado | Sin defecto | No se reescribió |
| 7 | No existe `000_baseline.sql`; el esquema no es reproducible solo con el repositorio | ALTO (entrega) | Documentado como pendiente |
| 8 | RLS, restauración y flujos reales no verificables sin staging | ALTO (evidencia) | Documentado como pendiente |
| 9 | Mantenimientos sin función de cierre, indicadores de revisión vencida incorrectos y escrituras directas sin trazabilidad | ALTO | Corregido: migración 013 con transiciones, validaciones y auditoría |

**Observación residual (BAJA, no corregida):** en la baja definitiva, la limpieza de Storage y Drive ocurre antes de la RPC final. Si el equipo se reactivara en esa ventana mínima, la RPC fallaría con el equipo ya sin fotografías. Es una carrera improbable en un flujo exclusivo de administrador; se documenta para no reescribir el diseño actual.

### Correcciones aplicadas al bloque crítico

| Archivo | Cambio |
|---|---|
| `src/App.tsx` | `/` hacia `/login`; Dashboard en `/dashboard`; fallback de permisos a `/dashboard`; wildcard a `/login`; componente `RevalidarAcceso` por cambio de ruta |
| `src/pages/Login.tsx` | Retorno seguro a `/dashboard`; se rechazan `/`, `/login`, `/restablecer-password` y orígenes externos |
| `src/layouts/AdminLayout.tsx` | Menú Dashboard hacia `/dashboard`; sección activa por ruta exacta o prefijo |
| `src/hooks/AuthContext.tsx` | Revalidación del perfil con throttle (mínimo 30 s, intervalo 60 s) en navegación, foco y visibilidad; limpieza de perfil y cierre local; `verificarAcceso` expuesto |
| `src/hooks/AuthContextStore.ts` | Tipo del contexto ampliado con `verificarAcceso` |

### Cierre del módulo de mantenimientos

| Archivo | Cambio |
|---|---|
| `supabase/migrations/013_cierre_mantenimientos.sql` | Tabla `mantenimiento_cambios_estado`, RPC `actualizar_mantenimiento`, transiciones y validaciones, indicadores corregidos, revisión vencida por la última intervención, auditoría idempotente y bloqueo de escrituras directas |
| `src/services/mantenimientosService.ts` | Técnico responsable, motivo del cambio de estado, filtros por tipo y estado del equipo, transiciones e historial |
| `src/pages/Mantenimientos.tsx` | Alta con asignación de técnico y motivo, modal de cierre/edición, filtros siempre visibles y cambios de estado por tarjeta |
| `src/pages/Equipos.tsx` | Historial por fecha, último mantenimiento real y enlace al historial completo del equipo |
| `src/pages/Reportes.tsx` | Exportación con técnico, componentes, resultado, observaciones, estado del equipo y transiciones |

Reglas aplicadas: el técnico solo se registra a sí mismo y un administrador puede asignar o reasignar; las transiciones permitidas son `pendiente → en_proceso`, `pendiente → completado` y `en_proceso → completado`; al completar se exigen diagnóstico, acciones y resultado, y el equipo no puede quedar en `en_mantenimiento`; todo cambio de estado del equipo exige motivo y queda registrado con usuario y fecha. Las escrituras directas sobre `mantenimientos` quedan revocadas para `anon` y `authenticated`.

## E. Pruebas ejecutadas y evidencia

| Comando | Resultado |
|---|---|
| `npm run build` | Correcto: `tsc -b` y `vite build`. Bundle principal aproximado de 134 kB (31 kB gzip), con chunks separados de React, Supabase y QR |
| `npm run lint` | Correcto, sin errores ni advertencias |
| `npx -y deno@2 check supabase/functions/*/index.ts` | Correcto: 10 Edge Functions verificadas |
| `parsePlPgSQL` sobre `013_cierre_mantenimientos.sql` y `supabase/tests/rls.sql` | Correcto: 5 y 6 rutinas PL/pgSQL sin errores de sintaxis |
| `npm audit --audit-level=low` | 0 vulnerabilidades |
| `git status` y `git diff --stat` | Sin commits ni push; cambios locales controlados |

**Pruebas no ejecutadas** porque requieren staging, navegador o credenciales: RLS completo, ciclo de mantenimientos, baja definitiva de extremo a extremo, restauración de respaldo, QR en móvil físico, cuotas del plan y sesión revocada real. No se declaran aprobadas.

## F. Seguridad y control de acceso

- **Sesión y perfil:** las rutas protegidas exigen sesión y perfil activo. El perfil se revalida al navegar, al recuperar foco o visibilidad y cada 60 s, con un mínimo de 30 s entre consultas. No hay consultas durante el render.
- **Cuenta revocada:** se limpia el perfil, se cierra solo la sesión local y se redirige a `/login` con un mensaje. Si el perfil no se puede verificar, se mantiene el criterio *fail-closed*.
- **Autorización real:** la interfaz no sustituye a RLS; las escrituras no autorizadas quedan bloqueadas por las políticas de la base.
- **Baja definitiva:** la Edge Function valida el token, el perfil admin activo, el estado `baja` y el código institucional. La RPC `(uuid, text, uuid)` solo es ejecutable por `service_role` y vuelve a validar al actor.
- **Auditoría:** el trigger `proteger_auditoria` bloquea UPDATE y DELETE incluso para `service_role`.
- **Secretos:** `.env` está ignorado; los `.env.*` versionados solo contienen `VITE_APP_URL`; `.env.example` usa valores vacíos. No se encontraron claves sensibles en el repositorio. `service_role` solo se usa en Edge Functions.
- **CORS:** se mantiene `*` con autenticación Bearer y sin cookies. Se acepta como riesgo controlado porque restringirlo puede romper el desarrollo local. Mejora futura: lista explícita de orígenes por entorno.

## G. Respaldo y recuperación

- El workflow `.github/workflows/backup-postgres.yml` ejecuta un `pg_dump` diario a las 08:00 UTC, verifica el dump antes y después del cifrado AES-256 y lo carga a Cloudflare R2.
- Secretos requeridos: `SUPABASE_DB_URL`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y `BACKUP_ENCRYPTION_PASSPHRASE`.
- La retención de 30 días se aplica con el ciclo de vida del bucket, no desde el workflow.
- El procedimiento de restauración está documentado en `documentacion/fase-11-pruebas-seguridad-respaldos.md`.
- **Pendiente:** ejecutar una restauración real en staging y registrar fecha, duración, resultado y acciones correctivas. El dump lógico no cubre Google Drive ni el PITR del proveedor.

## H. Despliegue

Orden recomendado, previa autorización y con respaldo reciente:

1. Aplicar en orden `supabase/migrations/011_eliminar_equipos_dados_de_baja.sql`, `supabase/migrations/012_eliminar_planos.sql` y `supabase/migrations/013_cierre_mantenimientos.sql`. Si el historial de migraciones remotas está vacío, ejecutarlas desde el SQL Editor; no usar `supabase db push` a ciegas porque intentaría reaplicar 001–010.
2. Desplegar la Edge Function nueva `admin-eliminar-equipo`.
3. Redesplegar `fotografias-drive`, que expone el borrado de Drive usado por la baja definitiva.
4. Compilar y publicar el frontend: `npm ci`, `npm run build` y `npx wrangler deploy`.
5. Verificar `/` hacia `/login`, `/dashboard`, las rutas directas con fallback SPA, la baja definitiva y el ciclo completo de una intervención.

> Si se publica el frontend antes de aplicar las migraciones, la baja definitiva falla por la RPC ausente, la eliminación de planos deja el archivo en Storage y el alta/cierre de mantenimientos falla por las funciones y la tabla de transiciones.

## I. Estado del repositorio

- Rama `main`, sin commits ni push durante la auditoría.
- Modificados: `App.tsx`, `AuthContext.tsx`, `AuthContextStore.ts`, `AdminLayout.tsx`, `Login.tsx`, `Equipos.tsx`, `Mantenimientos.tsx`, `Reportes.tsx`, `equiposService.ts`, `mantenimientosService.ts`, `ubicacionesService.ts`, `package.json`, `package-lock.json`, `vite.config.ts`, Edge Functions, migraciones, pruebas RLS, documentación y workflows.
- Sin seguimiento: `deno.lock` (intencional), `ConfirmarEliminacionEquipo.tsx`, `supabase/functions/admin-eliminar-equipo/`, `supabase/migrations/011_eliminar_equipos_dados_de_baja.sql`, `supabase/migrations/012_eliminar_planos.sql` y `supabase/migrations/013_cierre_mantenimientos.sql`.
- `supabase/.temp/cli-latest` figura modificado por la CLI de Supabase; es un archivo temporal ajeno a los cambios funcionales.
- No se ejecutaron operaciones destructivas ni cambios de producción, DNS o secretos.

## J. Pendientes y riesgos residuales

1. Ejecutar `supabase/tests/rls.sql` completo en staging; no debe contener filas `FALLA`.
2. Probar la baja definitiva de extremo a extremo y verificar `equipos_eliminados`, auditoría, Storage y Drive.
3. Probar la cuenta desactivada y el usuario eliminado con sesión abierta.
4. Generar `000_baseline.sql` desde el proyecto enlazado y validar un entorno desde cero.
5. Ejecutar la prueba de restauración documentada.
6. Probar QR, impresión y anchuras de 360, 390 y 768 px en dispositivos reales.
7. Probar el ciclo de mantenimientos en staging: asignación de técnico, transiciones, cierre con datos obligatorios, motivo del cambio de estado, edición de completadas solo por admin y bloqueo de escrituras directas.
8. Medir cuotas de base, Storage, egreso, Auth y Edge Functions frente al plan contratado.
9. Endurecer CORS por origen y evaluar la carrera menor de la baja definitiva.

## K. Veredicto técnico

**Aprobado en lo local y automatizable; no aprobado para producción todavía.**

- El repositorio compila, pasa lint y verifica los tipos de las 10 Edge Functions; no hay vulnerabilidades reportadas por `npm audit`.
- Los defectos críticos de rutas y sesión quedaron corregidos con cambios mínimos y reversibles.
- La baja definitiva, la inmutabilidad de la auditoría y la conservación de perfiles históricos están correctamente implementadas según inspección, pero su cumplimiento real depende de RLS en staging.
- La publicación queda condicionada a: migraciones 011–013 aplicadas, Edge Function desplegada, matriz RLS sin fallas, restauración verificada y pruebas de cuenta revocada aprobadas.
