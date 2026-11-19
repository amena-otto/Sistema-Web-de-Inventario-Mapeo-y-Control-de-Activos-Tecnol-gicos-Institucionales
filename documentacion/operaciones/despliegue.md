# Publicación y operaciones

Este documento describe el orden de compilación y publicación. No registra ejecuciones reales: la aplicación de migraciones a producción requiere respaldo reciente, autorización explícita y comprobaciones previas en un entorno de prueba.

## Verificación local

Desde la raíz del repositorio:

```powershell
npm ci
npm test
npm run lint
npm run build
deno check supabase/functions/*/index.ts
```

GitHub Actions ejecuta `npm ci`, `npm test`, `npm run lint`, `npm run build` y `deno check` en pull requests, push a `main` y ejecuciones manuales. Las variables de compilación del workflow son ficticias.

## Migraciones

El repositorio no incluye un `000_baseline.sql`, por lo que no debe ejecutarse `supabase db push` a ciegas sobre un proyecto existente: intentaría aplicar desde `001`. Antes de cualquier instalación hay que revisar el historial real y aplicar explícitamente solo las migraciones pendientes y revisadas.

Para reconstruir un entorno desde cero, enlaza el proyecto y genera el dump del esquema público antes de aplicar las migraciones:

```powershell
npx supabase link --project-ref <ref>
npx supabase db dump --schema public -f supabase/migrations/000_baseline.sql
```

Revisa el archivo generado y aplícalo como primera migración. Requiere acceso a la base del proyecto enlazado y no debe contener datos reales.

Para el bloque de estabilización de eliminación de equipos, el registro del 7 de noviembre de 2026 documenta el orden `015`, `016` y `017`, sus comprobaciones y los bloqueos previos a producción; véase [despliegue controlado de la estabilización](./despliegue-eliminacion-equipos.md).

La numeración `018` está reservada en los informes históricos para un trabajo de códigos por categoría que no está incluido en este repositorio. Las migraciones presentes `019` y `020` corresponden a oficinas independientes y áreas usuarias; deben revisarse contra el esquema de destino antes de aplicarlas. La migración `021` incorpora el ciclo automático de mantenimientos, la tabla `mantenimiento_avances` y las RPC del flujo: aplícala primero en un entorno aislado, comprueba que no existen duplicados `en_proceso` que impidan el índice único y verifica disparadores, RLS y permisos antes de cualquier publicación. No se ejecutó contra producción durante esta integración.

## Frontend

`wrangler.toml` publica el directorio `dist/` como Worker con `not_found_handling = "single-page-application"`. El nombre configurado es `sistema-web-de-inventario` y `workers_dev = true`. El dominio público actual es `https://sistema-web-de-inventario.amena-f7f.workers.dev`; la resolución SPA permite abrir rutas directas como `/equipos?equipo=<UUID>`.

La secuencia habitual, tras confirmar la cuenta y el Worker seleccionados, es:

1. Autentícate con `npx wrangler login` si la sesión local no está activa.
2. `npm run build`.
3. Verificar que `dist/` contiene el artefacto esperado.
4. `npx wrangler deploy`.

Si cambia el dominio, actualiza `VITE_APP_URL` en `.env.development`, `.env.production` y `.env.example`, además de la configuración de Auth y el secreto `APP_URL`, como se indica en [configuración de autenticación](./configuracion-autenticacion.md).

No se requieren cambios de bindings para el frontend; los secretos pertenecen a Supabase y a las Edge Functions.

## Edge Functions

Solo deben publicarse las funciones modificadas por el cambio que se despliega. La documentación de autenticación enumera las diez funciones presentes; el registro de eliminación de equipos identifica cuáles deben publicarse para ese bloque concreto.

## Verificación posterior

- Repetir la comprobación de solo lectura y comparar conteos, UUID, códigos y series con la línea base.
- Confirmar triggers, RLS, firma y permisos de las RPC afectadas.
- Probar inicio de sesión y recorridos por rol en las pantallas de inicio, equipos, ubicaciones, mantenimientos, movimientos, reportes, fotografías y etiquetas QR.
- Dejar las pruebas destructivas exclusivamente para datos ficticios en staging.

Los procedimientos de copia y restauración están en [respaldos y restauración local](./respaldos-restauracion.md).
