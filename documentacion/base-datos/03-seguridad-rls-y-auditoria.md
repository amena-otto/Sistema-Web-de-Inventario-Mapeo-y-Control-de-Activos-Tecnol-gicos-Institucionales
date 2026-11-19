# Seguridad, RLS y auditoría

## 1. Modelo de acceso

La autorización se apoya en tres capas:

1. La matriz de permisos del frontend (`src/hooks/usePermissions.ts`) controla menús, rutas y botones.
2. Las políticas de seguridad a nivel de fila (RLS) restringen lecturas y escrituras desde la API.
3. Las funciones `security definer` con `search_path` vacío centralizan las operaciones sensibles y validan el rol activo con `private.tiene_rol(...)`.

Los roles son `admin`, `tecnico` y `consulta`. Una cuenta inactiva deja de satisfacer las comprobaciones de rol en esas funciones.

## 2. Disparadores de auditoría

`private.registrar_auditoria()` se invoca mediante disparadores posteriores a operaciones sobre tablas relevantes.

| Tabla | Disparador | Eventos |
|---|---|---|
| componentes | `auditoria_componentes` | INSERT, UPDATE, DELETE |
| equipos | `auditoria_equipos` | INSERT, UPDATE, DELETE |
| mantenimientos | `auditoria_mantenimientos` | INSERT, UPDATE, DELETE |
| movimientos | `auditoria_movimientos` | INSERT, UPDATE, DELETE |
| relaciones_equipos | `auditoria_relaciones` | INSERT, UPDATE, DELETE |
| equipo_areas_usuarias | `auditoria_equipo_areas_usuarias` | INSERT, DELETE |

La documentación anterior registraba cinco disparadores y 15 combinaciones de tabla y operación. Con la migración `020` el inventario pasó a seis disparadores y 17 combinaciones; la migración `021` añade `auditoria_mantenimiento_avances` para inserciones, por lo que el inventario actual es de siete disparadores y 18 combinaciones.

Los seis disparadores de `public.equipos` que deben conservarse son `asignar_actor`, `asignar_codigo_equipo`, `auditoria_equipos`, `proteger_equipos`, `set_updated_at` y `validar_cambio_asignacion_equipo`.

## 3. Inmutabilidad y bajas definitivas

El disparador `proteger_auditoria`, creado por la migración `011`, rechaza cualquier `UPDATE` o `DELETE` sobre `public.auditoria`. La baja definitiva conserva las filas de auditoría y registra una constancia en `public.equipos_eliminados` con el código institucional, el estado del activo, la cantidad de fotografías, el administrador responsable y la fecha.

La función `public.eliminar_equipo_dado_de_baja(uuid, text, uuid)` es `security definer`, valida que el actor siga siendo administrador activo y solo se concede a `service_role`. El cliente la invoca indirectamente mediante la Edge Function `admin-eliminar-equipo`.

La tabla `eliminaciones_pendientes` no expone políticas a `anon` ni `authenticated`: solo `service_role` puede leerla y actualizarla. La migración `017` agregó `reclamar_limpieza_equipo(uuid, uuid)` con token y vencimiento de 15 minutos.

## 4. Escrituras de mantenimientos y trazabilidad de estados

La migración `013` revoca `insert`, `update` y `delete` sobre `public.mantenimientos` para `anon` y `authenticated`. Las altas y los cierres pasan por `public.registrar_mantenimiento(...)` y `public.actualizar_mantenimiento(...)`, que validan rol activo, técnico responsable, transiciones permitidas e información mínima al completar.

La tabla `mantenimiento_cambios_estado` es de solo lectura para los clientes. Sus filas incluyen motivo, usuario y fecha. Con la migración `021` el ciclo se separa en `iniciar_mantenimiento` (registra fecha real, usuario, estado previo y transición a `en_mantenimiento`), `guardar_avance_mantenimiento` (avances inmutables) y `finalizar_mantenimiento` (exige diagnóstico, acciones, resultado y estado operativo final explícito entre `operativo`, `con_fallas` e `inoperativo`). El equipo no puede quedar en `en_mantenimiento` al completar la intervención.

La migración `021` también crea `mantenimiento_avances`: RLS de solo lectura para `authenticated`, auditoría en inserción y un trigger que rechaza actualizaciones y borrados. Un índice único parcial y su trigger impiden dos intervenciones `en_proceso` por equipo; si hay duplicados históricos, el índice se omite sin alterar filas. Un trigger diferido sobre `equipos` bloquea cambios manuales del estado operativo mientras haya una intervención abierta, salvo que la transacción registre la transición; las operaciones sin sesión conservan su comportamiento. La RPC `corregir_estado_operativo_en_mantenimiento` permite la excepción administrativa solo con motivo y auditoría. Todas estas funciones son `security definer`, usan `search_path = ''` y conceden ejecución únicamente a `authenticated`.

## 5. Movimientos

La migración `010` revoca inserción, actualización y eliminación directas sobre `public.movimientos` para `authenticated`. El historial se escribe mediante `public.registrar_movimiento(...)`, que valida rol `admin` o `tecnico`, equipo activo, destino y responsable vigentes, y cambio efectivo de ubicación, responsable o posición.

El trigger `validar_cambio_asignacion_equipo` exige un movimiento registrado en la misma transacción para modificar `ambiente_id`, `responsable_id` o `posicion` de un equipo. Las funciones de consulta `listar_movimientos` y `listar_responsables_movimiento` requieren rol `admin` o `tecnico`.

## 6. Uso compartido

`equipo_areas_usuarias` tiene RLS habilitado. `authenticated` puede leer según rol (`admin`, `tecnico` o `consulta`) y existencia del equipo; las escrituras directas no están concedidas. La RPC `configurar_areas_equipo(...)` valida administrador o técnico activo, equipo activo, máximo 100 áreas, destinos válidos y configuración previa no modificada. Véase [equipos compartidos](../modulos/equipos-compartidos.md).

## 7. Verificación pendiente

La existencia de disparadores y políticas se comprobó mediante inspección y consultas al catálogo. Sigue pendiente ejecutar la matriz completa en un entorno de staging con el mismo esquema y al menos un usuario activo por rol, y comprobar que el usuario autenticado quede asociado a cada evento.
