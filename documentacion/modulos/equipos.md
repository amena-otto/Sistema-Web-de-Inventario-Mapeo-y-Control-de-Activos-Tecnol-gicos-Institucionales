# Equipos (inventario)

## 1. Objetivo y alcance

Gestionar el inventario físico de activos tecnológicos: alta, edición, consulta,
búsqueda, filtros, paginación, estados operativos, fotografías y baja lógica.
Es el módulo central y fuente de los datos que consumen el resto de módulos.

## 2. Funcionalidades implementadas

- Alta y edición de equipos con catálogos de categorías, ambientes y
  responsables.
- Código institucional `OT-EQP-000001` generado por la base de datos; no se
  edita ni cambia al trasladar el activo.
- Detalle organizado en pestañas: General, Áreas usuarias, Información técnica,
  Fotografías e Historial.
- Búsqueda por términos, filtros por categoría, ambiente (incluido «sin
  ubicación»), estado operativo, vista de activos o de baja, orden configurable
  y paginación. Los filtros se reflejan en la URL.
- Vista de tabla o tarjetas en escritorio; tarjetas en móvil. Filtros aplicados
  removibles.
- Detección de posibles duplicados por serie o código patrimonial antes de
  guardar; se puede confirmar el guardado.
- Fotografías: carga de principal y adicionales, reemplazo, selección de la
  principal y borrado; imágenes JPEG, PNG o WebP.
- Baja lógica reservada al administrador y posterior
  [baja definitiva](./baja-definitiva-equipos.md).
- Generación de [etiquetas QR](./etiquetas-qr.md) individuales y masivas desde
  el listado.
- Configuración de [áreas usuarias](./equipos-compartidos.md) desde la ficha.
- Importación y exportación en [Reportes](./reportes.md).

## 3. Flujo de funcionamiento

1. `listarEquipos` consulta la tabla con búsqueda, filtros, orden y rango; el
   total se obtiene con `count: 'exact'`.
2. Al abrir una ficha (por clic o por `/equipos?equipo=<UUID>`), se cargan
   datos generales, componentes, relaciones, áreas usuarias, fotografías e
   historial.
3. El formulario valida los campos obligatorios y advierte de duplicados; el
   guardado es explícito.
4. La baja cambia `situacion` a `baja` con `deleted_at`; no elimina el activo.
   La baja definitiva posterior es una operación aparte.

## 4. Roles y permisos

| Operación | Admin | Técnico | Consulta |
|---|---|---|---|
| Ver listado y ficha | Sí | Sí | Sí |
| Crear y editar | Sí | Sí | No |
| Gestionar fotografías | Sí | Sí | Solo ver |
| Dar de baja | Sí | No | No |
| Configurar áreas usuarias | Sí | Sí | Solo ver |
| Cambiar ubicación/responsable | Solo mediante [Movimientos](./movimientos.md) | Ídem | No |

Claves de permiso: `inventario.ver`, `equipos.crear`, `equipos.editar`,
`equipos.baja`. La autorización efectiva reside en las políticas RLS de
`equipos`, `componentes`, `relaciones_equipos` y `fotografias_equipos`.

## 5. Formularios y campos

 Campos del equipo: `nombre`, `numero_serie`, `categoria_id`, `ambiente_id`,
 `marca`, `modelo`, `codigo_patrimonial`, `posicion`, `responsable_id`,
 `estado_operativo`, `fecha_adquisicion`, `fecha_garantia`, `observaciones`.

 El código institucional y `created_at` los genera la base de datos.
 `situacion` (`activo`, `baja`, `archivado`) y `deleted_at` no se editan desde
 el formulario ordinario.

 Secciones auxiliares: componentes (véase [componentes](./componentes.md)),
 áreas usuarias, fotografías y relaciones entre equipos.

## 6. Validaciones y reglas de negocio

- Obligatorios en la interfaz: nombre, número de serie, categoría, ubicación y
  estado operativo.
- Estados operativos permitidos: `operativo`, `con_fallas` (etiqueta «Operativo
  con observaciones»), `en_mantenimiento`, `inoperativo`, `en_almacen`.
- `codigo_institucional` se asigna con una secuencia y un trigger antes de
  insertar (`generar_codigo_equipo`, `asignar_codigo_equipo`).
- Un trigger impide cambiar `ambiente_id`, `responsable_id` o `posicion` sin el
  movimiento correspondiente (migración 010).
- La baja es lógica y distinta del estado operativo. No se guardan contraseñas,
  credenciales ni secretos en las fichas.
- Fotografías: tipos MIME permitidos JPEG/PNG/WebP; `tipo = 'principal'` o
  `'adicional'`. Las imágenes se optimizan antes de almacenarse. Las fotos nuevas
  pueden guardarse de forma privada en Google Drive mediante la Edge Function
  `fotografias-drive`, que usa la autorización OAuth y los secretos ya
  configurados en Supabase, sin credenciales de cuenta de servicio. Admin y
  técnico pueden cargar, reemplazar, elegir la principal y eliminar imágenes;
  consulta solo puede verlas. Las rutas antiguas de Supabase Storage siguen
  siendo válidas junto con `drive_file_id` (migración 007). Al cambiar la Edge
  Function hay que volver a desplegarla con
  `supabase functions deploy fotografias-drive`.

## 7. Estados y transiciones

| Situación | Significado | Transición |
|---|---|---|
| `activo` | Activo en inventario | Alta; puede pasar a `baja` por decisión administrativa |
| `baja` | Baja lógica, aún consultable | Puede reactivarse o purgarse de forma definitiva |
| `archivado` | Situación histórica | Solo consulta |

El estado operativo cambia desde el formulario ordinario o, cuando debe quedar
trazado, desde mantenimientos y movimientos.

## 8. Integración con otros módulos

- [Dashboard](./dashboard.md): consume los activos y sus estados.
- [Ubicaciones](./ubicaciones.md): el ambiente define la jerarquía física.
- [Mantenimientos](./mantenimientos.md): actualiza el estado operativo del
  equipo y muestra su historial en la ficha.
- [Movimientos](./movimientos.md): único flujo válido para traslados y
  responsables.
- [Equipos compartidos](./equipos-compartidos.md): áreas usuarias adicionales
  sin duplicar el activo.
- [Reportes](./reportes.md): exportaciones e importación CSV.
- [Baja definitiva](./baja-definitiva-equipos.md): purga controlada.

## 9. Tablas y funciones utilizadas

`equipos`, `componentes`, `relaciones_equipos`, `fotografias_equipos`,
`categorias_equipos`, `ambientes`, `profiles`; funciones
`generar_codigo_equipo()`, `private.asignar_codigo_equipo()` y, para fotos,
Edge Function `fotografias-drive`. Detalles en
[estructura de tablas](../base-datos/01-estructura-tablas.md) y
[relaciones](../base-datos/02-relaciones-y-restricciones.md).

## 10. Archivos principales del código

- `src/pages/Equipos.tsx`
- `src/services/equiposService.ts`
- `src/utils/inventario.ts` — validación y normalización
- `src/utils/busquedaEquiposUbicacion.ts`, `src/utils/equiposPiso.ts`
- `src/components/ConfirmarEliminacionEquipo.tsx`

## 11. Filtros, búsquedas, indicadores y reportes

Búsqueda por código, nombre, serie y otros términos normalizados; filtros de
categoría, ambiente, sin ubicación y estado; cuatro criterios de orden;
paginación configurable desde la URL. No genera reportes propios.

## 12. Limitaciones conocidas

- No existe interfaz de planos de piso ni de marcadores del mapa, aunque las
  migraciones 005 y 012 crean la estructura. Véase
  [discrepancias](../discrepancias-conocidas.md), numeral 4.
- La baja definitiva y la limpieza de archivos son operaciones sensibles
  descritas en su propio módulo.
- La configuración de áreas usuarias no se incluye en el CSV.

## 13. Pruebas realizadas y pendientes

- **Registradas en entregas anteriores:** comprobaciones automatizadas de
  utilidades de inventario/CSV y revisiones de interfaz con Supabase simulado
  descritas en los [informes históricos](../historico/).
- **Pendientes en staging:** CRUD completo, búsqueda y filtros, estados,
  fotografías, duplicados, QR en móvil real y baja definitiva de extremo a
  extremo. Véase el [plan de pruebas](../pruebas/plan-pruebas.md).

## 14. Referencias

- [Componentes](./componentes.md)
- [Etiquetas QR](./etiquetas-qr.md)
- [Baja definitiva](./baja-definitiva-equipos.md)
- [Auditoría RLS](../base-datos/03-seguridad-rls-y-auditoria.md)
