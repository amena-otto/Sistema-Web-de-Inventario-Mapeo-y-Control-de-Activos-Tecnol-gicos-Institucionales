# Mantenimientos

## 1. Objetivo y alcance

Registrar el ciclo completo de intervenciones sobre activos: programación,
búsqueda escrita del equipo, ejecución, avances, cierre, actualización
automática del estado operativo y trazabilidad. Ruta: `/mantenimientos`.

Este es el documento principal del módulo. Consolida la información que antes
estaba repartida en el README, informes históricos, documentación de base de
datos y el documento temporal `docs/FLUJO_MANTENIMIENTOS_AUTOMATICO.md`, que
fue integrado aquí y eliminado. Las fuentes de comportamiento son el código y
las migraciones `008`, `009`, `013` y, para el ciclo automático, `021`.

## 2. Flujo obligatorio

### 2.1 Registrar

- El formulario exige buscar y seleccionar el equipo **por escrito**.
- La intervención se guarda siempre como `pendiente`.
- No se muestra selector del estado operativo; el alta **no modifica** el
  estado del equipo.
- Se registran tipo, fecha programada, problema reportado, técnico
  responsable, próxima revisión y observaciones opcionales.
- En la misma transacción se inserta la fila de alta en
  `mantenimiento_cambios_estado`, con el estado operativo del equipo sin
  cambios.

### 2.2 Iniciar

`Iniciar mantenimiento` pide confirmación y ejecuta una sola transacción que:

1. Pasa la intervención de `pendiente` a `en_proceso`.
2. Guarda `fecha_inicio_real` e `iniciado_por` con valores reales.
3. Conserva el estado operativo previo en `estado_operativo_anterior`.
4. Pone el equipo en `en_mantenimiento` automáticamente.
5. Inserta la transición en `mantenimiento_cambios_estado`.

La interfaz no solicita el estado operativo: lo determine la base de datos.

### 2.3 Durante el proceso

- La intervención permanece `en_proceso` y el equipo `en_mantenimiento`.
- «Guardar avance» crea una fila cronológica en `mantenimiento_avances` con
  descripción, diagnóstico, acciones, componentes, observaciones, usuario y
  fecha real.
- Los avances son **inmutables**: un trigger rechaza `UPDATE` y `DELETE`.
  Guardar otro avance no sobrescribe ni reinicia el anterior.
- La casilla «Establecer o modificar la próxima fecha de seguimiento»
  actualiza `proximo_seguimiento`; sin ella, cada avance conserva su propio
  valor histórico sin alterar el de la intervención.
- No se ofrece seleccionar el estado final durante el seguimiento.
- «Editar programación» no está disponible para intervenciones `en_proceso`.

### 2.4 Finalizar

«Finalizar mantenimiento» exige:

- Diagnóstico.
- Acciones realizadas.
- Resultado.
- Selección **explícita** del estado operativo final entre `operativo`,
  `con_fallas` e `inoperativo`. El selector nace vacío: finalizar no implica
  que el equipo quedó operativo.

La RPC `finalizar_mantenimiento` valida esos datos y, en una transacción,
registra `fecha_finalizacion_real` y `finalizado_por`, escribe la transición y
el historial, limpia `proximo_seguimiento`, actualiza la próxima revisión
preventiva si se indicó, cierra la intervención como `completado` y aplica al
equipo el estado elegido. `en_mantenimiento` no es un estado final admitido.

## 3. Búsqueda escrita de equipos

El formulario de registro usa `SearchableSelect` en modo remoto con la RPC
`buscar_equipos_mantenimiento`:

- Coincidencias parciales, sin distinguir mayúsculas, minúsculas ni tildes,
  mediante `normalizar_busqueda_mantenimientos` en PostgreSQL y
  `normalizarTexto` en el filtro local del componente.
- Busca por nombre, código institucional, número de serie, categoría y
  ubicación. La RPC también considera marca, modelo, código patrimonial,
  ambiente, piso y pabellón.
- Cada resultado muestra nombre y código, con serie, ubicación y categoría
  como detalle.
- Los términos separados por espacios deben coincidir todos.
- Navegación con `ArrowDown`, `ArrowUp`, `Enter` y `Escape`; el componente
  expone `combobox`, `listbox`, `option`, `aria-activedescendant` y
  `aria-expanded`.
- La petición se debouncea 250 ms, se pagina en bloques de 20 resultados y el
  servidor limita cada página a 100 filas. «Cargar más resultados» acumula la
  página siguiente.
- La selección se mantiene visible aunque el equipo salga de la página actual
  gracias a `selectedLabel`.

`SearchableSelect` conserva su API anterior: los selectores de filtros,
movimientos y otros formularios siguen filtrando en local. Las props nuevas
(`remoto`, `onBuscar`, `detalle`, `selectedLabel`, `onCargarMas`, `hayMas`,
`buscando`) son opcionales y solo se usan en este registro.

## 4. Roles y permisos

Claves de `usePermissions.ts`: `mantenimientos.ver` y
`mantenimientos.registrar` (admin y técnico). `consulta` no ve el módulo.

| Acción | Admin | Técnico |
|---|---|---|
| Ver listado, historial e indicadores | Sí | Sí |
| Registrar intervención | Sí | Sí |
| Buscar equipos mediante la RPC | Sí | Sí |
| Asignar/reasignar técnico | Sí | No |
| Iniciar, avanzar o finalizar la intervención asignada | Sí | Sí, solo la propia |
| Registrar avances de la intervención asignada | Sí | Sí, solo la propia |
| Editar intervención completada | Sí | No |
| Cambiar estado operativo durante una intervención abierta | Solo con corrección auditada y motivo | No |

Las funciones `security definer` validan sesión y rol activo con
`private.tiene_rol(...)`. Las escrituras directas sobre `mantenimientos` están
revocadas para `anon` y `authenticated` desde la migración `013`; la tabla de
avances solo permite lectura a `authenticated` desde la migración `021`. La
interfaz no es la única barrera.

## 5. Datos y estructura

### 5.1 Campos del ciclo

| Campo | Significado |
|---|---|
| `fecha_mantenimiento` | Fecha **programada**; no es la fecha real de inicio ni de cierre |
| `fecha_inicio_real` | Fecha y hora reales del inicio, con `iniciado_por` |
| `fecha_finalizacion_real` | Fecha y hora reales del cierre, con `finalizado_por` |
| `estado_operativo_anterior` | Estado del equipo inmediatamente antes de iniciar |
| `proximo_seguimiento` | Seguimiento de la intervención abierta; se limpia al cerrar |
| `proxima_revision` | Revisión preventiva posterior al cierre |

Los campos nuevos son anulables: las intervenciones históricas conservan
`NULL` y no se inventan fechas ni estados.

### 5.2 Tablas

- `mantenimientos` y `mantenimiento_cambios_estado` (008 y 013).
- `mantenimiento_avances` (021): avances cronológicos e inmutables, con RLS
  de solo lectura para `authenticated`, índice por intervención y fecha,
  auditoría en inserción y protección contra edición o borrado.
- `equipos`, `profiles` y `auditoria`.

### 5.3 Funciones

- 008/009/013: `registrar_mantenimiento`, `actualizar_mantenimiento`,
  `listar_tecnicos_mantenimiento`, `indicadores_mantenimiento` y
  `equipos_revision_vencida`.
- 021: `iniciar_mantenimiento`, `guardar_avance_mantenimiento`,
  `finalizar_mantenimiento`, `buscar_equipos_mantenimiento`,
  `normalizar_busqueda_mantenimientos` y
  `corregir_estado_operativo_en_mantenimiento`. Las firmas de registro y
  actualización se reemplazan para ajustarlas al nuevo ciclo.

Todas las RPC del flujo conceden ejecución solo a `authenticated`.

### 5.4 Protecciones en base de datos

- Un índice único parcial y un trigger impiden una segunda intervención
  `en_proceso` por equipo. El error incluye el UUID de la intervención
  bloqueante y la interfaz ofrece ver el historial filtrado de ese equipo.
- Si existen duplicados `en_proceso` anteriores a la migración, se omite el
  índice y se avisa; **no se eliminan ni corrigen** registros históricos.
- Un trigger diferido sobre `equipos.estado_operativo` rechaza cambios
  manuales con sesión mientras exista una intervención abierta, salvo que la
  transacción registre la transición correspondiente.
- Las operaciones sin sesión, como la baja definitiva, conservan su
  comportamiento.
- `corregir_estado_operativo_en_mantenimiento` es una salida administrativa
  de base de datos: exige rol `admin`, estado válido y motivo; escribe la
  transición auditada. No tiene botón propio en la interfaz actual.
- Cada RPC bloquea las filas afectadas y revierte todos sus cambios si falla
  cualquier validación.

## 6. Validaciones y transiciones

**Frontend (`Mantenimientos.tsx`)**

- El alta envía `estado: 'pendiente'` y no ofrece estado operativo.
- Validan equipo seleccionado, problema reportado, próxima revisión no
  anterior a la fecha programada, descripción del avance, fecha de
  seguimiento válida y campos obligatorios del cierre.
- Inicio, avance, cierre y edición están restringidos por rol y responsable.
- Los errores de RPC se muestran al usuario y no marcan éxito.

**Transiciones de la intervención**

| Estado anterior | Estados destino | Mecanismo |
|---|---|---|
| `pendiente` | `en_proceso` | `iniciar_mantenimiento` |
| `en_proceso` | `completado` | `finalizar_mantenimiento` |
| `pendiente` / `en_proceso` / `completado` | El mismo | `actualizar_mantenimiento` (edición ordinaria o corrección administrativa) |

No se permite retroceder ni cambiar de estado desde el formulario de
edición. La RPC de actualización rechaza cualquier estado distinto del
actual.

**Estado operativo del equipo**

- El alta lo conserva.
- `Iniciar` lo pone en `en_mantenimiento`.
- Los avances lo mantienen en `en_mantenimiento`.
- `Finalizar` aplica `operativo`, `con_fallas` o `inoperativo`, elegidos
  explícitamente.

## 7. Auditoría e historial

Cada alta, inicio, cierre y corrección escribe `mantenimiento_cambios_estado`
con estado anterior y nuevo de la intervención y del equipo, motivo, usuario y
fecha. La tabla es de solo lectura para clientes. Los avances generan
adicionalmente una fila en `auditoria` al insertarse y no pueden modificarse
después. La tarjeta de cada intervención muestra avances, fechas reales,
usuario responsable de cada transición y el detalle del historial.

## 8. Integración con otros módulos

- [Equipos](./equipos.md): historial en la ficha y estado operativo.
- [Dashboard](./dashboard.md): indicadores de mantenimiento.
- [Reportes](./reportes.md): exportación de intervenciones y transiciones.
- [Usuarios y permisos](./usuarios-permisos.md): roles, cuentas activas y RLS.

## 9. Listado, filtros e indicadores

Los filtros visibles son **equipo**, **técnico responsable**, **estado de la
intervención**, **tipo**, **desde** y **hasta**, con «Actualizar», «Ver
historial completo» / «Ver últimos registros» y «Limpiar filtros». Los filtros
`estadoEquipo` y `revision=vencida` se aceptan por parámetros de URL y por el
servicio, pero no tienen control visible.

Indicadores: equipos pendientes, equipos en proceso, equipos con revisión
vencida e intervenciones del mes. Orden por fecha de creación o de
mantenimiento, y paginación de 10 registros por página.

## 10. Archivos y migraciones relacionadas

- `src/pages/Mantenimientos.tsx` — interfaz del ciclo completo.
- `src/services/mantenimientosService.ts` — tipos, búsqueda remota y RPC.
- `src/components/SearchableSelect.tsx` — selector compartido con búsqueda
  local y remota, navegación por teclado y atributos ARIA.
- `supabase/migrations/008_modulo_mantenimientos.sql`.
- `supabase/migrations/009_tecnicos_activos_mantenimiento.sql`.
- `supabase/migrations/013_cierre_mantenimientos.sql`.
- `supabase/migrations/021_flujo_mantenimientos_automatico.sql` — incremental,
  idempotente y sin operaciones destructivas sobre datos existentes.
- `tests/flujoMantenimientosAutomatico.test.mjs` — 14 pruebas aisladas con
  PGlite.

Especificación en [estructura de tablas](../base-datos/01-estructura-tablas.md),
[relaciones y restricciones](../base-datos/02-relaciones-y-restricciones.md) y
[seguridad RLS](../base-datos/03-seguridad-rls-y-auditoria.md).

La migración `021` debe aplicarse primero en un entorno aislado con una copia
del esquema real, verificando duplicados `en_proceso`, disparadores, permisos y
la plantilla de roles. No se ejecutó contra la base real durante este trabajo.

## 11. Limitaciones reales

- Los filtros `estadoEquipo` y `revisionVencida` solo son accesibles por URL.
- «Revisión vencida» cuenta intervenciones no completadas con fecha pasada;
  no significa «última intervención completada vencida».
- `descripcion` se conserva como espejo de `problema_reportado` por
  compatibilidad histórica.
- Un técnico inactivo puede aparecer en el historial, pero no se le puede
  asignar una intervención nueva.
- La corrección administrativa del estado operativo existe en base de datos,
  pero no tiene un botón dedicado en la interfaz.
- Si había duplicados `en_proceso`, el índice único no se crea; la protección
  sigue vigente en el trigger, pero conviene revisar esos datos antes de
  publicar.
- No hay pruebas automatizadas de navegador: teclado, ARIA, diseño móvil y
  selección visual requieren verificación manual en staging.
- La instalación real debe confirmar que `021` no fue aplicada antes y que la
  plantilla de permisos coincide con la reproducida en PGlite.

## 12. Pruebas

**Ejecutadas localmente**

- `npm run lint`: correcto.
- `npm run build`: correcto.
- `node --test tests/flujoMantenimientosAutomatico.test.mjs`: 14/14
  aprobadas. Cubren idempotencia de `021`, campos nulos en históricos, alta
  pendiente sin tocar el equipo, inicio atómico con auditoría, bloqueo de
  doble `en_proceso` con UUID, avances inmutables y sin reinicio, cierre
  inválido y válido, búsqueda sin tildes por todos los campos, paginación y
  límite, protección del estado operativo, excepción administrativa,
  rollback transaccional, RLS y conservación de duplicados históricos.
- `npm test`: 152/152 aprobadas, cero fallos. Incluye las 14 pruebas nuevas.

**Pendientes en staging**

- Aplicar `021` sobre una copia del esquema real y comprobar duplicados
  `en_proceso`, triggers, RLS, firma y permisos de RPC.
- Revisar visualmente el selector y el ciclo completo en escritorio y móvil,
  incluidos teclado, ARIA y conservación de la selección.
- Confirmar que indicadores, filtros y reportes reflejan `pendiente`,
  `en_proceso` y `completado` tras la migración.
- Ejecutar `supabase/tests/rls.sql` completo y comprobar que no devuelve
  filas `FALLA`.

## 13. Referencias

- [Equipos](./equipos.md)
- [Usuarios y permisos](./usuarios-permisos.md)
- [Plan de pruebas](../pruebas/plan-pruebas.md)
- [Publicación y operaciones](../operaciones/despliegue.md)
- [Discrepancias conocidas](../discrepancias-conocidas.md) — numerales 2, 3, 5 y 6.
