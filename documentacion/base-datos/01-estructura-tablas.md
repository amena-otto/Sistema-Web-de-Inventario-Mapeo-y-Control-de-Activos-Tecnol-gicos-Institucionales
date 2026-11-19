# Estructura de tablas

## 1. Información general

**Proyecto:** Sistema Web de Inventario, Mapeo y Control de Activos Tecnológicos Institucionales.

**Institución:** IES Privado Otto Tonsmann.

**Motor de base de datos:** PostgreSQL mediante Supabase.

## 2. Inventario de tablas

Las migraciones del repositorio describen las siguientes tablas activas:

1. ambientes
2. auditoria
3. categorias_equipos
4. componentes
5. eliminaciones_pendientes
6. equipo_areas_usuarias
7. equipos
8. equipos_eliminados
9. fotografias_equipos
10. mantenimiento_avances
11. mantenimiento_cambios_estado
12. mantenimientos
13. movimientos
14. pabellones
15. pisos
16. profiles
17. relaciones_equipos

La migración `005_mapeo_institucional.sql` creó además `marcadores_mapa`, pero no existe código en `src/` que la utilice. La migración `015` retiró el trigger dependiente cuando la tabla no estaba presente, y el registro operativo del 7 de noviembre de 2026 confirma su ausencia en el entorno revisado. Puede persistir en instalaciones antiguas.

## 3. Columnas y tipos de datos

La definición detallada de columnas, tipos, nulidad y valores por defecto requiere una consulta al esquema real. El repositorio no incluye un `000_baseline.sql`, por lo que esa verificación sigue pendiente. Las relaciones y restricciones documentadas se resumen en [relaciones y restricciones](./02-relaciones-y-restricciones.md).

## 4. Estado de la documentación

- [ ] Columnas y tipos de datos verificados contra el esquema real.
- [x] Relaciones y claves foráneas documentadas a partir de migraciones.
- [ ] Inventario completo de índices verificado en el catálogo.
- [x] Políticas RLS, disparadores y RPC documentados en [seguridad, RLS y auditoría](./03-seguridad-rls-y-auditoria.md).

## 5. Inventario de equipos y mapeo institucional

La migración `004_modulo_inventario.sql` amplía `equipos` con `codigo_patrimonial`, `posicion`, `responsable_id` y `fecha_garantia`. `codigo_institucional` se genera en la base de datos con una secuencia y no se modifica al trasladar el activo. `fecha_ultimo_mantenimiento` se consulta desde el historial de mantenimientos.

Los estados operativos permitidos son `operativo`, `con_fallas`, `en_mantenimiento`, `inoperativo` y `en_almacen`. La baja es una situación administrativa (`situacion = 'baja'` con `deleted_at`), distinta del estado operativo.

La migración `005_mapeo_institucional.sql` agregó la referencia al plano privado en `pisos` y la tabla `marcadores_mapa`. También configuró los pabellones A–D y sus pisos iniciales, además de un laboratorio de cómputo en los pisos 1 y 2 del pabellón C. La interfaz de planos y marcadores no está implementada en `src/`.

La migración `006_eliminar_ubicaciones.sql` habilita la eliminación de pabellones, pisos y ambientes únicamente para administradores. La aplicación impide borrar ubicaciones con pisos, ambientes o equipos relacionados; primero deben reasignarse o eliminarse esas dependencias.

La migración `007_fotografias_google_drive.sql` agrega `drive_file_id` a `fotografias_equipos` y permite que `ruta_storage` sea nulo para fotos almacenadas de forma privada en Google Drive. Las rutas anteriores de Supabase Storage permanecen válidas.

La migración `008_modulo_mantenimientos.sql` amplía `mantenimientos` con diagnóstico, acciones, resultado, componentes reemplazados y próxima revisión. Completa la fecha y el problema de los registros previos, agrega índices y crea funciones protegidas para registrar intervenciones, consultar técnicos y calcular indicadores.

La migración `009_tecnicos_activos_mantenimiento.sql` distingue cuentas activas e inactivas en la consulta de técnicos. La interfaz solo ofrece técnicos activos, pero conserva los nombres históricos.

La migración `010_control_movimientos.sql` amplía `movimientos` con fecha, asignación anterior/nueva y posición anterior/nueva. El registro se hace mediante una función transaccional que persiste el historial y actualiza ubicación, posición y responsable. Un trigger impide cambiar esos campos por fuera de un movimiento registrado.

La migración `011_eliminar_equipos_dados_de_baja.sql` agrega `equipos_eliminados`, la constancia permanente de cada baja definitiva. La purga conserva las filas de `auditoria` y elimina el historial operativo del activo. Un disparador impide modificar o borrar la auditoría, y la función de purga solo puede ser ejecutada por `service_role`.

La migración `012_eliminar_planos.sql` agrega la política de borrado del bucket privado `planos-institucionales`. Los planos se guardan como `pisos/<id-del-piso>/<uuid>.webp` y la ruta se conserva en `pisos.plano_storage_path`. No crea ni elimina tablas.

La migración `013_cierre_mantenimientos.sql` agrega `mantenimiento_cambios_estado`, registra transiciones de la intervención y del equipo, reemplaza la función de registro, crea `actualizar_mantenimiento`, corrige indicadores y bloquea escrituras directas sobre `mantenimientos`.

La migración `014_eliminar_categorias.sql` concede `DELETE` sobre `categorias_equipos` y crea una política para administradores activos. La aplicación valida primero que la categoría no tenga equipos asignados.

Las migraciones `015`, `016` y `017` corrigen y refuerzan la eliminación definitiva: retiran dependencias obsoletas, hacen idempotente la RPC, crean `eliminaciones_pendientes` y capturan el manifiesto de archivos dentro de la transacción con un bloqueo por token. Véase [baja definitiva de equipos](../modulos/baja-definitiva-equipos.md).

La migración `019_oficinas_independientes.sql` permite `NULL` en piso y código de los ambientes, agrega `icono` y reglas para escrituras futuras. No contiene `INSERT`, `UPDATE` ni `DELETE` sobre registros existentes.

La migración `020_equipos_compartidos.sql` crea `equipo_areas_usuarias`, su índice, RLS, trigger de auditoría y la RPC `configurar_areas_equipo`. No modifica equipos, ubicaciones ni movimientos. Véase [equipos compartidos](../modulos/equipos-compartidos.md).

La migración `021_flujo_mantenimientos_automatico.sql` agrega a
`mantenimientos` las columnas anulables `estado_operativo_anterior`,
`fecha_inicio_real`, `fecha_finalizacion_real`, `iniciado_por`,
`finalizado_por` y `proximo_seguimiento`. Crea `mantenimiento_avances` con su
índice cronológico, RLS de solo lectura y protección contra edición o borrado.
Añade un índice único parcial, triggers de validación y las RPC del ciclo. No
reescribe migraciones históricas ni modifica registros existentes. Véase
[mantenimientos](../modulos/mantenimientos.md).
