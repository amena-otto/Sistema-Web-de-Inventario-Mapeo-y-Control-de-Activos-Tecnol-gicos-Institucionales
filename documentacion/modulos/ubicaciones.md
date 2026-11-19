# Ubicaciones

## 1. Objetivo y alcance

Administrar la jerarquía física (pabellones, pisos y ambientes) y el catálogo de
oficinas independientes, además de consultar los equipos de cada ambiente. La
ruta es `/ubicaciones`.

## 2. Funcionalidades implementadas

- Alta, edición y corrección de pabellones, pisos y ambientes.
- Dos presentaciones: **Áreas académicas** (oficinas y ambientes heredados del
  agrupador `AREAS`) y **Pabellones** (su jerarquía de pisos y ambientes).
- Oficinas nuevas con tipo, nombre, descripción opcional e icono automático o
  elegido; no piden ni generan piso, pabellón ni código de aula.
- Aulas y laboratorios conservan piso y código obligatorios.
- Ambientes heredados mantienen sus IDs, nombres, códigos, tipos y relaciones;
  al editarlos se conservan su código y piso originales.
- Iconos SVG por ambiente y categoría. Los iconos personalizados de ambientes
  se guardan en `ambientes.icono`; los de categoría se sugieren por nombre.
- Tarjetas con conteo de equipos activos y resumen de estado; se conserva la
  tabla y la paginación.
- Enlace desde un ambiente a Equipos filtrado; al pulsar «Agregar equipo» queda
  preseleccionada esa ubicación.
- Eliminación solo de ubicaciones sin dependencias.
- Traslados hacia oficinas independientes, aulas y laboratorios mediante la RPC
  de [Movimientos](./movimientos.md).
- Advertencia de nombres de oficina repetidos, ignorando tildes, espacios y
  mayúsculas.

## 3. Flujo de funcionamiento

1. `listarPabellones`, `listarPisos` y `listarAmbientes` cargan los catálogos.
2. La interfaz separa oficinas/áreas de la jerarquía física y calcula conteos
   de equipos activos por ambiente.
3. Crear o editar una oficina guarda `piso_id` y `codigo` nulos cuando corresponde.
4. Borrar una ubicación comprueba primero sus dependencias: pisos con ambientes,
   ambientes con equipos y pabellones con pisos deben vaciarse o reasignarse.

## 4. Roles y permisos

| Operación | Admin | Técnico | Consulta |
|---|---|---|---|
| Consultar catálogos y equipos por ubicación | Sí | Sí | Sí |
| Crear, editar y eliminar ubicaciones | Sí | No | No |
| Preseleccionar ubicación al crear equipo | Sí | Sí | No |

Clave `ubicaciones.administrar` (solo administrador). Las escrituras directas
de ambientes se rigen por las políticas RLS de la base de datos.

## 5. Formularios y campos

- **Pabellón:** nombre.
- **Piso:** pabellón y nombre.
- **Ambiente:** tipo (`oficina`, `aula`, `laboratorio`, entre otros), nombre,
  descripción, código, piso, activo e icono opcional.

Para oficinas nuevas, `piso_id` y `codigo` pueden ser nulos. Para aulas y
laboratorios se exigen ambos.

## 6. Validaciones y reglas de negocio

- La migración `019_oficinas_independientes.sql` permite NULL en `piso_id` y
  `codigo`, agrega `icono` y crea dos CHECK con `NOT VALID`:
  - `ambientes_ubicacion_por_tipo`: tipo `oficina` **o** piso y código no vacíos.
  - `ambientes_icono_valido`: valores permitidos
    `oficina`, `aula`, `laboratorio`, `contabilidad`, `personas`,
    `tecnologia`, `marketing`, `logistica`, `tesoreria`.
- `NOT VALID` significa que no valida retroactivamente registros históricos;
  las nuevas escrituras sí se comprueban.
- La migración 019 es exclusivamente estructural: no contiene INSERT, UPDATE,
  DELETE ni reasignación de activos. La numeración 018 se reservó para otra
  migración ajena a esta rama.
- La migración `006_eliminar_ubicaciones.sql` habilita borrados solo para
  administradores; la aplicación impide borrar si hay dependencias.
- La advertencia de nombres duplicados es de interfaz, no una garantía de
  exclusión entre operaciones concurrentes.
- En CSV, `ambiente_codigo` admite el código heredado o el nombre de una
  oficina; una coincidencia ambigua se rechaza (véase [Reportes](./reportes.md)).

## 7. Estados y transiciones

`ambientes.activo` determina si un ambiente está disponible como destino. No
hay un flujo de estados adicional; las bajas de equipos se gestionan en
[Equipos](./equipos.md).

## 8. Integración con otros módulos

- [Equipos](./equipos.md): el ambiente es la ubicación física del activo.
- [Movimientos](./movimientos.md): registra los traslados entre ambientes.
- [Equipos compartidos](./equipos-compartidos.md): las oficinas del agrupador
  `AREAS` también son elegibles como áreas usuarias.
- [Dashboard](./dashboard.md): oficinas cuentan en totales sin inventar piso.

## 9. Tablas y funciones utilizadas

`pabellones`, `pisos`, `ambientes` y `equipos`; migraciones 005, 006, 012 y 019.
No hay RPC propia de altas de
ubicaciones. Detalles en [estructura de tablas](../base-datos/01-estructura-tablas.md).

## 10. Archivos principales del código

- `src/pages/Ubicaciones.tsx`
- `src/services/ubicacionesService.ts`
- `src/utils/ubicaciones.ts`, `src/utils/equiposPiso.ts`
- `src/components/IconoInventario.tsx`, `src/components/SearchableSelect.tsx`

## 11. Filtros, búsquedas, indicadores y reportes

Conteos de equipos activos y resumen de estado por ambiente; búsqueda y
paginación en el listado; enlace filtrado a Equipos. No genera reportes propios.

## 12. Limitaciones conocidas

- No hay interfaz de planos de piso ni de marcadores, pese a la estructura de
  las migraciones 005 y 012. La documentación anterior describía planos
  optimizados en el bucket privado `planos-institucionales`, URLs firmadas
  temporales, marcadores con coordenadas normalizadas ligadas al equipo y
  borrado del marcador anterior al trasladar un activo de piso, además de
  actualización en tiempo real. Esas capacidades no están implementadas en
  `src/`. Véase [discrepancias](../discrepancias-conocidas.md), numeral 4.
- La validación de nombres repetidos no cubre concurrencia.
- Las restricciones CHECK de la migración 019 no validan datos históricos.

## 13. Pruebas realizadas y pendientes

- **Registradas en la entrega de oficinas:** 128 pruebas automáticas correctas,
  cero omitidas y cero fallos; revisión de interfaz con Supabase simulado en
  1440 px y 390 px, sin conexión a producción. Véase el
  [registro histórico](../historico/entrega-oficinas-independientes.md).
- **Pendientes en staging:** creación y edición de oficinas, aulas y
  laboratorios, traslados, CSV, roles y comprobación contra el esquema real.

## 14. Referencias

- [Equipos](./equipos.md)
- [Movimientos](./movimientos.md)
- [Relaciones y restricciones](../base-datos/02-relaciones-y-restricciones.md)
