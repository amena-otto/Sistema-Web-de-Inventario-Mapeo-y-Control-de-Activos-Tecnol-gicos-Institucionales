# Baja definitiva de equipos

La baja definitiva es la eliminación irreversible de un equipo que ya estaba en situación `baja`. No debe confundirse con el cambio de estado a `baja`, que conserva el registro para consulta e historial.

Solo un administrador activo puede solicitarla. El cliente no ejecuta la purga directamente: la solicitud pasa por la Edge Function `admin-eliminar-equipo`, que valida permisos, coordina la limpieza de archivos e invoca la función protegida de PostgreSQL con `service_role`.

## Secuencia operativa

1. El equipo debe existir y estar en situación `baja`.
2. El administrador confirma el código institucional exacto.
3. La Edge Function registra las rutas de Storage y los identificadores de Google Drive antes de tocar la base de datos.
4. La RPC `eliminar_equipo_dado_de_baja(equipo_id, codigo_institucional, actor_id)` valida al administrador, bloquea el registro del equipo, guarda la constancia y elimina los datos operativos en una sola transacción.
5. Solo si PostgreSQL confirma la eliminación se limpian los archivos en Storage y Drive.
6. Si falla la limpieza de archivos, la fila pendiente permite reanudarla sin repetir la purga de la base.

La RPC también acepta reintentos idempotentes: si el equipo ya no existe pero `equipos_eliminados` contiene la misma combinación de identificador y código, la operación se considera exitosa.

## Evidencia conservada

La tabla `equipos_eliminados` guarda el identificador, código, nombre, datos completos del equipo en JSON, cantidad de fotografías eliminadas, usuario que ejecutó la baja y fecha. Solo pueden consultarla administradores; no admite modificaciones desde la API.

La tabla `auditoria` es inmutable: un trigger impide actualizaciones y eliminaciones. La auditoría de la baja registra al administrador que ejecutó la operación.

Los vínculos de áreas usuarias (`equipo_areas_usuarias`) se eliminan con el equipo y quedan auditados. No ocurre lo mismo con los archivos externos: estos se gestionan mediante la cola de limpieza.

## Limpieza diferida

La tabla `eliminaciones_pendientes` contiene:

- rutas del bucket `fotografias-equipos`;
- identificadores de archivos de Google Drive;
- indicadores de limpieza de Storage y Drive;
- usuario y fechas de creación y actualización.

No tiene políticas RLS publicadas: solo `service_role` puede leerla y actualizarla. La migración 017 añadió un token de bloqueo con vencimiento de 15 minutos para que dos procesos no limpien el mismo equipo a la vez. Si un proceso muere, un administrador puede reclamar la limpieza después del vencimiento.

La migración 017 captura el manifiesto de archivos dentro de la misma transacción que la eliminación, bloquea escrituras de fotografías durante esa captura y rechaza la baja si una ruta o identificador de archivo está compartido con otro equipo. No realiza llamadas externas bajo el bloqueo SQL.

## Histórico de migraciones relacionadas

- `011_eliminar_equipos_dados_de_baja.sql`: creó la constancia de bajas, la inmutabilidad de auditoría y la RPC original.
- `012_eliminar_planos.sql`: retiró la tabla `marcadores_mapa` y su funcionalidad obsoleta.
- `015_corregir_eliminacion_definitiva_equipos.sql`: eliminó la dependencia obsoleta de `marcadores_mapa`, conservó firma, permisos y seis triggers legítimos, e hizo idempotente la operación.
- `016_limpieza_diferida_eliminacion_equipos.sql`: creó la cola privada de limpieza de archivos.
- `017_eliminacion_atomica_y_bloqueo_limpieza.sql`: unió la captura del manifiesto con la eliminación transaccional y agregó el bloqueo con token y vencimiento.

La instalación de estas migraciones no actualiza ni elimina registros institucionales existentes. La documentación operativa y los bloqueos de despliegue se conservan en `../operaciones/respaldos-restauracion.md` y en el registro histórico de despliegue.

## Puntos de validación

- No eliminar definitivamente un equipo activo ni con código distinto al confirmado.
- No ejecutar la RPC desde el navegador ni concederla a `authenticated`.
- No borrar la constancia de baja ni las filas de auditoría.
- No limpiar archivos antes de confirmar la transacción en PostgreSQL.
- No eliminar un ambiente vinculado a un equipo todavía existente.
- No usar una versión antigua de la Edge Function que borre archivos antes de confirmar la base de datos.

## Fuentes

- `supabase/migrations/011_eliminar_equipos_dados_de_baja.sql`
- `supabase/migrations/015_corregir_eliminacion_definitiva_equipos.sql`
- `supabase/migrations/016_limpieza_diferida_eliminacion_equipos.sql`
- `supabase/migrations/017_eliminacion_atomica_y_bloqueo_limpieza.sql`
- `src/components/ConfirmarEliminacionEquipo.tsx`
