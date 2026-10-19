
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
