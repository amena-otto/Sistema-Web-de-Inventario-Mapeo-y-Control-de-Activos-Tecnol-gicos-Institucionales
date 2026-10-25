
## 5. Auditoría de operaciones

La base de datos dispone de la función `private.registrar_auditoria()`, invocada por disparadores que se ejecutan después de las operaciones realizadas sobre determinadas tablas.

### 5.1 Disparadores identificados

| Tabla | Disparador | Eventos registrados |
|---|---|---|
| componentes | auditoria_componentes | INSERT, UPDATE, DELETE |
| equipos | auditoria_equipos | INSERT, UPDATE, DELETE |
| mantenimientos | auditoria_mantenimientos | INSERT, UPDATE, DELETE |
| movimientos | auditoria_movimientos | INSERT, UPDATE, DELETE |
| relaciones_equipos | auditoria_relaciones | INSERT, UPDATE, DELETE |

En total se identificaron cinco disparadores, cada uno asociado a tres eventos, lo que representa 15 combinaciones de tabla y operación.

### 5.2 Finalidad

La auditoría permite registrar operaciones efectuadas sobre información relevante del sistema y facilita la trazabilidad de los cambios.

### 5.3 Verificación pendiente

La existencia de los disparadores fue comprobada mediante una consulta al catálogo de PostgreSQL. Aún debe verificarse mediante operaciones reales desde la aplicación que los registros se generen correctamente y que el usuario autenticado quede asociado al evento cuando corresponda.

### 5.4 Inmutabilidad y bajas definitivas

La migración `supabase/migrations/011_eliminar_equipos_dados_de_baja.sql` agrega el disparador `proteger_auditoria`, que rechaza cualquier `UPDATE` o `DELETE` sobre `public.auditoria`. La baja definitiva de un equipo conserva sus filas de auditoría y registra una constancia en `public.equipos_eliminados` con el código institucional, el snapshot del activo, la cantidad de fotografías, el administrador responsable y la fecha. De este modo, la limpieza del historial operativo no elimina la evidencia de quién autorizó la baja.

La función `public.eliminar_equipo_dado_de_baja(uuid, text, uuid)` es `security definer`, valida que el actor siga siendo un administrador activo y solo se concede a `service_role`; el cliente la invoca indirectamente a través de la Edge Function `admin-eliminar-equipo`.

### 5.5 Escrituras de mantenimientos y trazabilidad de estados

La migración `supabase/migrations/013_cierre_mantenimientos.sql` revoca `insert`, `update` y `delete` sobre `public.mantenimientos` para `anon` y `authenticated`. Las altas y los cierres pasan exclusivamente por `public.registrar_mantenimiento(...)` y `public.actualizar_mantenimiento(...)`, ambas `security definer`, que validan el rol activo, el técnico responsable, las transiciones permitidas y la información mínima para completar. La tabla `mantenimiento_cambios_estado` es de solo lectura para los clientes; sus filas las insertan esas funciones e incluyen el motivo, el usuario y la fecha. La misma migración recrea de forma idempotente los disparadores de auditoría de `equipos`, `mantenimientos`, `componentes`, `relaciones_equipos` y `movimientos`.
