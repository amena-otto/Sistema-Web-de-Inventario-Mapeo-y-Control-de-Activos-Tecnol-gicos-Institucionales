# Reportes e importación

El módulo de reportes genera vistas previas y archivos descargables del inventario, mantenimientos y movimientos. También permite importar equipos desde CSV previa validación.

## Tipos de reporte

| Tipo | Contenido |
|---|---|
| Inventario general | Equipos con filtros de búsqueda, estado, categoría y ubicación. |
| Inventario por pabellón | Equipos de un pabellón seleccionado. |
| Inventario por piso y ambiente | Equipos de un piso o ambiente seleccionado. |
| Equipos operativos | Equipos con estado operativo `operativo`. |
| Equipos inoperativos | Equipos con estado operativo `inoperativo`. |
| Equipos por categoría | Equipos de una categoría seleccionada. |
| Historial de mantenimientos | Intervenciones, estados, técnico, diagnóstico, acciones y cambios de estado derivados. |
| Historial de movimientos | Fecha, origen, destino, responsables, posiciones y motivo. |
| Equipos dados de baja | Equipos con situación `baja`. |

Los reportes de mantenimientos y movimientos solo aparecen si el perfil tiene los permisos `mantenimientos.ver` y `movimientos.ver`, respectivamente. Para los historiales se aplican primero los filtros de inventario y después el rango de fechas; la interfaz lista todas las páginas necesarias para cruzar los resultados con los equipos coincidentes.

## Filtros y generación

Los filtros disponibles son búsqueda por código, nombre, marca o serie, estado o situación, categoría, pabellón, piso, ambiente y rango de fechas para historiales. Los reportes por pabellón, piso/ambiente y categoría exigen seleccionar el criterio correspondiente.

Al generar un reporte se muestra una vista previa de los primeros ocho registros y el total de filas. La exportación CSV descarga todos los equipos que coinciden con la búsqueda y los filtros actuales, no solo la página visible: los datos se obtienen de la tabla en lotes e incluyen los nombres de categoría y el código de ambiente. La descarga puede hacerse en CSV con codificación UTF-8 y separador de coma, o en XLSX generado localmente. Los valores que empiezan con `=`, `+`, `-`, `@`, tabulador o retorno se preceden de comilla simple en CSV para evitar interpretaciones de fórmula. En XLSX se escapan los caracteres XML y se filtran caracteres de control.

Las columnas del inventario incluyen código institucional, nombre, categoría, marca, modelo, número de serie, código patrimonial, pabellón, piso, código de ambiente, ambiente, posición, estado operativo, situación, fecha de adquisición, vencimiento de garantía y observaciones. Las oficinas no aportan pabellón, piso ni código de ambiente en el reporte.

## Importación CSV

La plantilla se descarga desde la propia pantalla. El archivo no puede superar 2 MB ni 500 filas. Se admiten separadores de coma, punto y coma o tabulación, y codificaciones UTF-8, UTF-16 y Windows-1252. Las categorías y los códigos de ambiente deben existir previamente; al buscar categorías se normalizan mayúsculas y tildes, y se toleran columnas vacías finales o faltantes al final de una fila. La vista previa verifica cabeceras, categorías, ambientes, fechas, estados, números de serie y códigos patrimoniales duplicados, tanto dentro del archivo como frente al inventario actual.

Las filas válidas y las rechazadas se muestran en una tabla con el detalle de errores. Solo después de revisar esa vista previa puede confirmarse la importación; cada fila se importa por separado y el resultado indica cuántas filas se importaron y cuántas se rechazaron. Si una plantilla antigua incluye características técnicas, esas filas se marcan como inválidas y las características deben agregarse después desde la ficha del equipo.

La selección y confirmación de CSV comparten un bloqueo para evitar solicitudes superpuestas.

## Permisos

- Ver reportes: `admin`, `tecnico` y `consulta`.
- Importar equipos: `admin` y `tecnico`, mediante `equipos.crear`.
- Ver historial de mantenimientos: `admin` y `tecnico`.
- Ver historial de movimientos: `admin` y `tecnico`.

Los permisos se comprueban en la interfaz con `usePermissions`; las consultas a mantenimientos y movimientos también validan el rol en las funciones de base de datos.

## Fuentes

- `src/pages/Reportes.tsx`
- `src/services/equiposService.ts`
- `src/services/mantenimientosService.ts`
- `src/services/movimientosService.ts`
- `src/utils/csvInventario.ts`
- `src/hooks/usePermissions.ts`
