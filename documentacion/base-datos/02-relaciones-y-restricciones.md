
# Relaciones y restricciones de la base de datos

## 1. Información general

La base de datos utiliza restricciones de PostgreSQL para mantener la integridad de los registros y las relaciones entre las tablas del sistema.

## 2. Relaciones entre tablas

| Tabla de origen | Columna | Tabla relacionada | Columna relacionada |
|---|---|---|---|
| ambientes | piso_id | pisos | id |
| auditoria | usuario_id | profiles | id |
| componentes | equipo_id | equipos | id |
| equipos | ambiente_id | ambientes | id |
| equipos | categoria_id | categorias_equipos | id |
| equipos | creado_por | profiles | id |
| fotografias_equipos | creado_por | profiles | id |
| fotografias_equipos | equipo_id | equipos | id |
| mantenimientos | equipo_id | equipos | id |
| mantenimientos | responsable_id | profiles | id |
| movimientos | ambiente_destino_id | ambientes | id |
| movimientos | ambiente_origen_id | ambientes | id |
| movimientos | equipo_id | equipos | id |
| movimientos | responsable_id | profiles | id |
| movimientos | responsable_anterior_id | profiles | id |
| movimientos | responsable_nuevo_id | profiles | id |
| pisos | pabellon_id | pabellones | id |
| relaciones_equipos | equipo_principal_id | equipos | id |
| relaciones_equipos | equipo_relacionado_id | equipos | id |

## 3. Claves primarias

Las tablas utilizan claves primarias para identificar de forma única cada registro. En el esquema consultado, las restricciones siguen el formato `<nombre_tabla>_pkey`.

## 4. Restricciones UNIQUE

Se verificaron las siguientes restricciones de unicidad:

- `ambientes`: combinación de `piso_id` y `codigo`.
- `categorias_equipos`: `nombre`.
- `equipos`: `codigo_institucional`.
- `fotografias_equipos`: `ruta_storage`.
- `pabellones`: `nombre`.
- `pisos`: combinación de `pabellon_id` y `nombre`.

Estas restricciones evitan duplicidades en los campos o combinaciones correspondientes.

## 5. Restricciones CHECK

Se identificaron restricciones para validar los valores y estados de los registros, entre ellas:

- `ambientes_tipo_check`: valida el tipo de ambiente.
- `auditoria_operacion_check`: valida la operación registrada en la auditoría.
- `equipos_check`: valida la coherencia entre la situación del equipo y su eliminación lógica.
- `equipos_estado_operativo_check`: valida el estado operativo del equipo.
- `equipos_situacion_check`: valida la situación del equipo.
- `mantenimientos_estado_check`: valida el estado del mantenimiento.
- `mantenimientos_tipo_check`: valida el tipo de mantenimiento.
- `movimientos_check`: valida una condición definida para los movimientos.

También existen restricciones de obligatoriedad para distintas columnas.

La migración `008_modulo_mantenimientos.sql` admite los estados de intervención
`pendiente`, `en_proceso` y `completado`, y los tipos `preventivo` y
`correctivo`. La función de registro solo acepta administradores y técnicos
activos; inserta la intervención y, si se especifica, actualiza el estado del
equipo de forma atómica.

La migración `010_control_movimientos.sql` conserva fechas, ubicación,
responsable y posición anteriores y nuevos. La escritura del historial y la
actualización del equipo ocurren en una única función transaccional; un trigger
rechaza cambios directos de ubicación, posición o responsable que no tengan un
movimiento asociado. Las filas de movimientos son inmutables desde la API.

## 6. Integridad referencial

Las claves foráneas conectan los equipos con sus categorías y ambientes; los ambientes con los pisos; los pisos con los pabellones; y los registros operativos con los usuarios correspondientes.

## 7. Índices

La base de datos cuenta con índices destinados a facilitar las búsquedas y preservar la unicidad de determinados datos. El inventario completo de índices debe verificarse mediante una consulta específica.

## 8. Conclusión

Las claves primarias, claves foráneas y restricciones contribuyen a preservar la integridad y consistencia de la información institucional.
