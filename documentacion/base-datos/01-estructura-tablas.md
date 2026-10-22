
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
6. fotografias_equipos
7. mantenimientos
8. movimientos
9. pabellones
10. pisos
11. profiles
12. relaciones_equipos

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