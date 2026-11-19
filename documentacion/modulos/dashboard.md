# Dashboard (Inicio)

## 1. Objetivo y alcance

Presentar un resumen del inventario institucional y de la actividad de
mantenimiento en la ruta `/dashboard`. Es la pantalla de destino después del
login y el destino seguro cuando un rol intenta abrir una ruta sin permiso.

## 2. Funcionalidades implementadas

- Indicadores de equipos: total, activos, dados de baja, archivados y
  distribución por estado operativo (operativo, con fallas, en almacén, en
  mantenimiento e inoperativo).
- Distribución por categoría y por jerarquía física (pabellón → piso → ambiente).
- Listados navegables de ambientes y equipos con enlaces a sus fichas.
- Panel de mantenimiento con totales, pendientes, en proceso, completados y
  revisiones vencidas, solo para perfiles autorizados.
- Filtros por pabellón, piso y ambiente que afectan a los indicadores y a los
  listados de la pantalla.

## 3. Flujo de funcionamiento

1. `RutaProtegida` exige sesión y perfil; `RutaPorPermiso` exige
   `inventario.ver`; un rol sin permiso vuelve a `/dashboard`.
2. `obtenerResumenDashboard` lee equipos en lotes de 500, ambientes con su
   jerarquía y categorías.
3. Los ambientes de tipo oficina se tratan sin piso ni pabellón: cuentan en los
   totales y en ubicaciones, pero no se inventa una agrupación física para ellos.
4. Los datos de mantenimiento se consultan solo si el perfil tiene
   `mantenimientos.ver`; de lo contrario el bloque no se muestra.
5. Los filtros recalculan el resumen sobre el conjunto filtrado sin recargar la
   ruta.

## 4. Roles y permisos

| Rol | Acceso | Observación |
|---|---|---|
| `admin` | Sí | Ve además los indicadores de mantenimiento |
| `tecnico` | Sí | Ve los indicadores de mantenimiento |
| `consulta` | Sí | No ve el bloque de mantenimiento |

La ocultación del bloque es una mejora de experiencia; RLS sigue siendo la
barrera real sobre `mantenimientos`.

## 5. Formularios y campos

No hay formularios de edición. Los únicos controles son los selectores de
pabellón, piso y ambiente.

## 6. Validaciones y reglas de negocio

- La lectura de equipos se pagina en bloques de 500 para no depender del
  límite de filas de PostgREST.
- «Con observaciones» es la etiqueta de interfaz del estado `con_fallas`.
- «Revisión vencida» significa mantenimiento no completado cuya
  `proxima_revision` es menor o igual a la fecha actual, sobre equipos activos.
  No se calcula sobre «la última intervención aunque esté completada».
- El conteo filtrado de revisiones vencidas se calcula en el cliente con el
  mismo criterio que la RPC; sin filtros se usa `indicadores_mantenimiento()`.

## 7. Estados y transiciones

El módulo es de solo lectura. Los estados que muestra proceden de
`equipos.estado_operativo`, `equipos.situacion` y `mantenimientos.estado`.

## 8. Integración con otros módulos

- Enlaza a [Equipos](./equipos.md), [Ubicaciones](./ubicaciones.md) y
  [Mantenimientos](./mantenimientos.md).
- Comparte la definición de oficinas con el módulo de ubicaciones.

## 9. Tablas y funciones utilizadas

`equipos`, `ambientes`, `pabellones`, `pisos`, `categorias_equipos` y
`mantenimientos`; RPC `indicadores_mantenimiento()`. Detalles en
[estructura de tablas](../base-datos/01-estructura-tablas.md) y
[seguridad RLS](../base-datos/03-seguridad-rls-y-auditoria.md).

## 10. Archivos principales del código

- `src/pages/dashboard.tsx`
- `src/services/dashboardService.ts`
- `src/hooks/usePermissions.ts`
- `src/utils/ubicaciones.ts`

## 11. Filtros, búsquedas, indicadores y reportes

Filtros: pabellón, piso y ambiente. Indicadores: los enumerados en el apartado 2.
No genera reportes; para exportar, véase [Reportes](./reportes.md).

## 12. Limitaciones conocidas

- Los totales se calculan en el navegador a partir de los registros leídos; no
  son una agregación SQL.
- No muestra planos ni marcadores del mapa: esa interfaz no existe en `src/`.
- La disponibilidad de cifras de mantenimiento depende de permisos y RLS.

## 13. Pruebas realizadas y pendientes

- **Registradas en entregas anteriores:** revisión visual de escritorio y móvil
  del panel con Supabase simulado, descrita en el
  [registro de oficinas](../historico/entrega-oficinas-independientes.md).
- **Pendientes en staging:** comprobar los conteos del dashboard frente al
  inventario filtrado y con un usuario de cada rol; véase el
  [plan de pruebas](../pruebas/plan-pruebas.md).

## 14. Referencias

- [Mantenimientos](./mantenimientos.md) — criterio de revisión vencida.
- [Ubicaciones](./ubicaciones.md) — oficinas sin piso.
- [Discrepancias conocidas](../discrepancias-conocidas.md) — numerales 2 y 4.
