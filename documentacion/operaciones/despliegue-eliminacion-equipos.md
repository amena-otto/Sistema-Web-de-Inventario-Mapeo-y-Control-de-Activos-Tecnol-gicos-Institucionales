# Despliegue controlado de la estabilizacion

Estado comprobado el 7 de noviembre de 2026. No se aplicaron migraciones ni se publicaron funciones en produccion durante esta intervencion.

## Evidencia del entorno

Proyecto de produccion: `bdtsevlgnwpduujcbatk`, PostgreSQL 17.11.
La consulta de solo lectura encontro 47 equipos, 3 perfiles, 3 usuarios Auth y
434 registros de auditoria. `marcadores_mapa`, su funcion obsoleta y
`eliminaciones_pendientes` no existen. Estan presentes los seis triggers
legitimos. La RPC publicada es anterior a 015: no tiene reintento idempotente ni
la limpieza de mantenimiento_cambios_estado. El historial
`supabase_migrations.schema_migrations` tampoco existe.

**No ejecutar `supabase db push`: intentaria aplicar desde 001 sobre el esquema existente.**
No reparar el historial inventando migraciones aplicadas. Las pendientes verificadas
para este cambio son 015, 016 y 017, que se aplicaran explicitamente en ese orden.

## Cambios y compatibilidad

- 015 conserva firma, seis triggers, permisos y auditoria; retira solo dependencias obsoletas.
- 016 crea la cola privada, con RLS y acceso exclusivo de service_role.
- 017 reemplaza la misma RPC: captura el manifiesto de archivos dentro de la
  transaccion de eliminacion, valida referencias compartidas y serializa bajas
  por equipo. No necesita enumerar fotos mediante PostgREST ni depende de su limite de filas.
  La captura bloquea escrituras de fotografias durante la transaccion corta;
  no realiza llamadas externas bajo bloqueo SQL.
- 017 agrega un bloqueo de limpieza con token y vencimiento de 15 minutos.
  Las actualizaciones de progreso verifican el token. Si el proceso muere, un
  administrador puede reintentar tras el vencimiento.
- La Edge procesa como maximo dos lotes de 50 por proveedor y solicitud; conserva
  el resto. Un fallo de checkpoint conserva la cola y permite repetir operaciones idempotentes.
- Drive rechaza la limpieza masiva sin constancia confirmada, si el equipo aun
  existe o si un archivo sigue referenciado. Storage tambien comprueba referencias.
- La vista Equipos dados de baja permite consultar y reanudar las primeras 100
  limpiezas pendientes. Tras completarlas se consultan las siguientes. Ambas acciones
  vuelven a validar administrador activo en el servidor.
- El respaldo SQL se realiza localmente con herramientas gratuitas, sin almacenamiento de pago.
- El frontend conserva filtros, ambas paginaciones y QR con codigo y serie.
  La preparacion/importacion CSV ahora comparte un bloqueo para evitar solicitudes superpuestas.
- El contrato POST de eliminacion conserva equipoId, codigoInstitucional, success,
  limpiezaCompleta, advertencia y archivosPendientes. fotografias es nullable.

La instalacion de las tres migraciones no actualiza ni elimina registros
institucionales existentes. La eliminacion definitiva solicitada posteriormente
por un administrador sigue purgando el historial operativo y conserva constancia y auditoria.

## Verificaciones realizadas

- npm ci; npm test; npm run lint; npm run build.
- deno check sobre las diez funciones.
- PostgreSQL embebido desechable: permisos, idempotencia, SQL fallido,
  referencias compartidas y registro atomico.
- Handler ejecutado con servicios simulados: SQL, Storage, Drive, red, checkpoint,
  respuesta perdida, reintentos, permisos, 151 fotos y exclusion de trabajadores.
- Respaldo adicional completo con pg_dump 18.6 contra PostgreSQL 17.11.
- Cifrado AES256, descifrado y comparacion byte por byte; SHA256 del cifrado.
- Restauracion real en PostgreSQL 18.6 local aislado de los esquemas
  auth, public, private y storage; no-owner/no-privileges. Las extensiones y
  publicacion necesarias se prepararon localmente. Esto no acredita una
  restauracion completa de todos los servicios gestionados de Supabase o sus ACL originales.
- Huellas de filas completas de equipos, perfiles y auditoria identicas entre
  origen y restauracion. 015-017 aplicadas dos veces sobre esa restauracion.
- SQL de prueba con triggers reales y 151 fotos ficticias; transaccion revertida.
- Dos conexiones PostgreSQL concurrentes sobre una copia local: una constancia,
  un manifiesto y un solo trabajador autorizado.

## Bloqueos antes de autorizar produccion

1. Crear una copia local cifrada reciente con scripts/backup-postgres-local.ps1.
   No requiere R2, tarjeta ni secretos en GitHub. Seguir restauracion-backup.md.
2. Comprobar su restauracion real con scripts/verificar-restaurar-local.ps1,
   conservar evidencia por SHA256 y las copias independientes de Storage/Drive.
   Una tarea de Windows no se considera operativa hasta verificar ejecucion y restauracion.
3. Probar contra staging Supabase completo (Auth, RLS, Storage y Drive de prueba).
   No se encontro una rama staging del proyecto. El otro proyecto de la cuenta
   pertenece a otra aplicacion y no se usa para esta prueba.
4. Verificar login y recorridos de la interfaz con cuentas de prueba por rol.
   No usar ni eliminar equipos institucionales para comprobar la baja.
5. Confirmar CI del commit final y refrescar el respaldo si cambia produccion.

No solicitar autorizacion de despliegue mientras falte cualquiera de estos puntos.

## Comandos exactos, solo tras cumplir las verificaciones y recibir autorizacion

Desde la raiz del repositorio, con la sesion Supabase ya autenticada:

```powershell
npx --yes supabase db query --remote=bdtsevlgnwpduujcbatk --read-only --file supabase/tests/preflight_estabilizacion.sql --output json
npx --yes supabase db query --remote=bdtsevlgnwpduujcbatk --file supabase/migrations/015_corregir_eliminacion_definitiva_equipos.sql --yes
npx --yes supabase db query --remote=bdtsevlgnwpduujcbatk --file supabase/migrations/016_limpieza_diferida_eliminacion_equipos.sql --yes
npx --yes supabase db query --remote=bdtsevlgnwpduujcbatk --file supabase/migrations/017_eliminacion_atomica_y_bloqueo_limpieza.sql --yes
npx --yes supabase functions deploy fotografias-drive --project-ref bdtsevlgnwpduujcbatk
npx --yes supabase functions deploy admin-eliminar-equipo --project-ref bdtsevlgnwpduujcbatk
npm run build
npx --yes wrangler deploy
```

No se requieren cambios de bindings ni secretos Cloudflare para este frontend.
El despliegue usa dist y la configuracion SPA existente de wrangler.toml.
Las otras ocho funciones no se modificaron en este PR y no necesitan publicarse
por este cambio. Antes de ejecutar, confirmar la cuenta y Worker seleccionados.

## Verificacion posterior

Repetir preflight y comparar conteos, UUID, codigos y series contra la linea base.
Confirmar seis triggers, RLS, firma y permisos de las RPC, versiones activas de
ambas funciones y ausencia de errores criticos. Probar login, dashboard,
equipos/filtros/ambas paginaciones, ubicaciones, mantenimientos, movimientos,
reportes, fotos y etiquetas QR con operaciones seguras. Las pruebas destructivas
solo se hacen con datos ficticios en staging.

## Reversion sin perdida

- Deshabilitar temporalmente la eliminacion definitiva si hay una incidencia.
- Conservar 016 y 017 y todas sus filas pendientes; no ejecutar DROP, reset ni reimportacion.
- Revertir el frontend al artefacto aprobado anterior si hace falta.
- Conservar las funciones seguras actuales o corregir hacia adelante.
  No restaurar una Edge que borre archivos antes de confirmar PostgreSQL.
- La RPC 015 aislada no sustituye a 017 para este frontend/Edge: perderia el
  manifiesto atomico. Si hay que volver a ella, primero bloquear las bajas y
  mantener disponible la recuperacion de las colas existentes.
- Una restauracion PostgreSQL es un procedimiento separado, requiere aprobacion
  y restauracion previa en un entorno descartable. No recupera binarios Storage/Drive.
