
# Documentación de la base de datos

## 1. Información general

**Proyecto:** Sistema Web de Inventario, Mapeo y Control de Activos Tecnológicos Institucionales.

**Institución:** IES Privado Otto Tonsmann.

**Motor de base de datos:** PostgreSQL mediante Supabase.

## 2. Estructura de tablas

La base de datos está organizada en las siguientes tablas:

1. ambientes
2. auditoria
3. categorias_equipos
4. componentes
5. equipos
6. equipos_eliminados
7. fotografias_equipos
8. mantenimientos
9. mantenimiento_cambios_estado
10. movimientos
11. pabellones
12. pisos
13. profiles
14. relaciones_equipos

## 3. Columnas y tipos de datos

La definición detallada de las columnas, sus tipos de datos, restricciones de nulidad y valores por defecto se documentará a partir de las consultas realizadas en Supabase.

## 4. Estado de la documentación

- [ ] Columnas y tipos de datos verificados.
- [ ] Relaciones y claves foráneas documentadas.
- [ ] Restricciones e índices documentados.
- [ ] Políticas RLS y auditoría documentadas.

## 5. Inventario de equipos y mapeo institucional

La migración `supabase/migrations/004_modulo_inventario.sql` amplía `equipos`
con `codigo_patrimonial`, `posicion`, `responsable_id` y `fecha_garantia`.
`codigo_institucional` se genera en la base de datos con una secuencia y no se
modifica al trasladar el activo. `fecha_ultimo_mantenimiento` se consulta desde
el historial de mantenimientos.

Los estados operativos permitidos son `operativo`, `con_fallas`,
`en_mantenimiento`, `inoperativo` y `en_almacen`. La baja es una situación
administrativa (`situacion = 'baja'` con `deleted_at`), distinta del estado
operativo.

La migración `supabase/migrations/005_mapeo_institucional.sql` agrega la
referencia al plano privado en `pisos` y la tabla `marcadores_mapa`, que vincula
cada equipo con coordenadas normalizadas del plano. La relación se valida
contra el piso del ambiente asignado; si un equipo se traslada a otro piso, se
retira el marcador anterior para ubicarlo de nuevo en el mapa correspondiente.
La migración configura los pabellones A-D y sus pisos iniciales, además de un
laboratorio de cómputo en cada uno de los pisos 1 y 2 del pabellón C.

La migración `supabase/migrations/006_eliminar_ubicaciones.sql` habilita la
eliminación de pabellones, pisos y ambientes únicamente para administradores.
La aplicación impide borrar ubicaciones con pisos, ambientes o equipos
relacionados; primero deben reasignarse o eliminarse esas dependencias.

La migración `supabase/migrations/007_fotografias_google_drive.sql` agrega
`drive_file_id` a `fotografias_equipos` y permite que `ruta_storage` sea nulo
para fotos almacenadas de forma privada en Google Drive. Las rutas anteriores
de Supabase Storage permanecen válidas.

La migración `supabase/migrations/008_modulo_mantenimientos.sql` amplía
`mantenimientos` con los datos de diagnóstico, acciones, resultado,
componentes reemplazados y próxima revisión. Completa la fecha y el problema de
los registros previos, agrega índices para historial y filtros, y crea las
funciones protegidas para registrar una intervención, consultar los nombres
de técnicos y calcular indicadores. La función de registro actualiza el estado
operativo del equipo en la misma transacción cuando se indica uno.

La migración `supabase/migrations/009_tecnicos_activos_mantenimiento.sql`
actualiza la consulta de técnicos para distinguir cuentas activas e inactivas.
La interfaz solo ofrece técnicos activos para filtrar o elegir, pero conserva
los nombres históricos de quienes ya no tienen una cuenta activa.

La migración `supabase/migrations/010_control_movimientos.sql` amplía
`movimientos` con fecha, asignación anterior/nueva y posición anterior/nueva.
El registro se hace mediante una función transaccional que persiste el historial
y actualiza ubicación, posición y responsable actuales del equipo. Un trigger
impide cambiar esos campos por fuera de un movimiento registrado; los clientes
no tienen permisos para insertar, modificar ni borrar filas del historial.

La migración `supabase/migrations/011_eliminar_equipos_dados_de_baja.sql`
agrega `equipos_eliminados`, la constancia permanente de cada baja definitiva
(código, nombre, snapshot del equipo, cantidad de fotografías, usuario y
fecha). La purga conserva las filas de `auditoria` y elimina únicamente el
historial operativo del activo. Un disparador impide modificar o borrar la
auditoría, y la función de purga solo puede ser ejecutada por `service_role`
a través de la Edge Function `admin-eliminar-equipo`.

La migración `supabase/migrations/012_eliminar_planos.sql` agrega la política de
borrado del bucket privado `planos-institucionales`. Los planos se guardan como
`pisos/<id-del-piso>/<uuid>.webp` y la ruta se conserva en
`pisos.plano_storage_path`. Al eliminar el plano desde Ubicaciones, la
aplicación desvincula la ruta del piso y borra el archivo de Storage; la
operación está reservada a administradores activos.

La migración `supabase/migrations/013_cierre_mantenimientos.sql` agrega la tabla
`mantenimiento_cambios_estado`, que registra la transición de la intervención y
del equipo, el motivo, el usuario y la fecha. Reemplaza la función de registro
para admitir un técnico responsable distinto cuando lo asigna un administrador y
crea `actualizar_mantenimiento`, que aplica las transiciones permitidas
(`pendiente → en_proceso`, `pendiente → completado`, `en_proceso → completado`),
exige diagnóstico, acciones y resultado al completar, y actualiza el equipo en la
misma transacción. También corrige los indicadores y bloquea las escrituras
directas sobre `mantenimientos`, de modo que toda modificación pase por las
funciones transaccionales.