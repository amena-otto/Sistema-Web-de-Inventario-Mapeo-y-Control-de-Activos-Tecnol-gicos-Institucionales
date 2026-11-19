# Mantenimientos

## 1. Objetivo y alcance

Registrar el ciclo completo de intervenciones sobre activos: programación,
asignación de técnico, ejecución, cierre, cambio del estado operativo del
equipo y trazabilidad de cada transición. Ruta: `/mantenimientos`.

Este documento consolida la información que antes estaba repartida en el
README, `documentacion/auditoria-cierre.md` y la documentación de base de datos.
La fuente de comportamiento es el código y las migraciones `008`, `009` y `013`.

## 2. Funcionalidades implementadas

- Mantenimientos **preventivos** y **correctivos**.
- Alta con equipo, tipo, fecha, problema reportado y estado inicial.
- Asignación de técnico responsable: el técnico se registra a sí mismo; un
  administrador puede asignar o reasignar a otro técnico activo.
- Registro de intervención: diagnóstico, acciones realizadas, componentes
  reemplazados, resultado y observaciones.
- Próxima revisión y cálculo de revisiones vencidas.
- Estados `pendiente`, `en_proceso` y `completado` con transiciones forward-only.
- Acciones de interfaz «Iniciar» (a `en_proceso`) y «Registrar realizado» (a
  `completado`), además de edición.
- Cambio del estado operativo del equipo desde el alta o la actualización,
  siempre con motivo.
- Historial de transiciones con estado anterior y nuevo de la intervención y
  del equipo, motivo, usuario y fecha.
- Indicadores, filtros, orden y paginación.
- Historial por equipo en su ficha y exportación desde
  [Reportes](./reportes.md).

## 3. Flujo de funcionamiento

1. **Alta.** El formulario elige equipo y tipo, fecha, problema, datos
   opcionales de intervención, próxima revisión, técnico responsable y, si
   aplica, estado operativo destino con su motivo. `guardar` fuerza
   `estado: 'pendiente'` antes de llamar a `registrar_mantenimiento`.
2. **Inicio.** El responsable o un administrador abre una intervención pendiente
   con «Iniciar»; la RPC la pasa a `en_proceso`.
3. **Ejecución/cierre.** «Registrar realizado» exige diagnóstico, acciones y
   resultado; la RPC pasa a `completado` y verifica que el equipo no quede en
   `en_mantenimiento`.
4. **Edición.** El responsable o un administrador puede editar datos; solo un
   administrador puede editar una intervención completada.
5. **Trazabilidad.** Cada cambio de estado de la intervención o del equipo
   inserta una fila en `mantenimiento_cambios_estado` dentro de la misma
   transacción.

## 4. Roles y permisos

Claves de `usePermissions.ts`: `mantenimientos.ver` y
`mantenimientos.registrar` (admin y técnico). `consulta` no ve el módulo.

| Acción | Admin | Técnico |
|---|---|---|
| Ver listado, historial e indicadores | Sí | Sí |
| Registrar intervención | Sí | Sí, solo como responsable |
| Asignar/reasignar técnico | Sí | No |
| Iniciar o cerrar la intervención que tiene asignada | Sí | Sí |
| Editar intervención completada | Sí | No |
| Cambiar estado operativo del equipo | Sí, con motivo | Sí, con motivo |

La RPC valida el rol activo en servidor. Las escrituras directas sobre
`public.mantenimientos` están revocadas para `anon` y `authenticated` (migración
013), de modo que ningún cliente puede alterar estados sin pasar por las
funciones transaccionales.

## 5. Formularios y campos

| Campo | Uso | Obligatoriedad |
|---|---|---|
| `equipo_id` | Activo intervenido, de `equipos` con `situacion = 'activo'` | Sí |
| `tipo` | `preventivo` / `correctivo` | Sí |
| `fecha_mantenimiento` | Fecha de la intervención | Sí (default `current_date`) |
| `problema_reportado` | Motivo o falla informada; se refleja en `descripcion` | Sí |
| `diagnostico` | Causa determinada | Obligatorio al completar |
| `acciones_realizadas` | Trabajo efectuado | Obligatorio al completar |
| `componentes_reemplazados` | Repuestos, texto libre | No |
| `resultado` | Resultado de la intervención | Obligatorio al completar |
| `observaciones` | Notas adicionales | No |
| `proxima_revision` | Fecha de la siguiente revisión | No; no puede ser anterior a la fecha |
| `estado` | Estado de la intervención | Sí |
| `responsable_id` | Técnico activo | Sí (por defecto, quien registra) |
| `p_estado_equipo` / `p_motivo` | Estado operativo destino y motivo | El motivo es obligatorio si el estado cambia |

## 6. Validaciones y reglas de negocio

**Frontend (`Mantenimientos.tsx`)**

- El alta siempre se guarda como `pendiente`; si el formulario marca
  `completado`, se muestra un error.
- Próxima revisión no anterior a la fecha del mantenimiento.
- Cambiar el estado operativo exige motivo.
- Al completar se exigen diagnóstico, acciones y resultado; si se había
  seleccionado `en_mantenimiento`, el formulario lo cambia automáticamente a
  `operativo`.
- Edición restringida al responsable o administrador; las completadas, solo a
  administrador.

**Base de datos (migraciones 008, 009 y 013)**

- `registrar_mantenimiento(...)`: verifica sesión y rol `admin`/`tecnico`
  activo; tipo y estado válidos; fecha y problema no vacíos; próxima revisión no
  anterior a la fecha; datos mínimos al completar; responsable activo; equipo
  activo (bloqueo `FOR UPDATE`); equipo no puede quedar en `en_mantenimiento` al
  completar; motivo obligatorio si cambia el estado del equipo. Inserta la
  intervención, actualiza el equipo y registra la transición en una transacción.
- `listar_tecnicos_mantenimiento()` (009): devuelve `id`, `nombres`,
  `apellidos` y `activo` para roles `admin`/`tecnico`; la interfaz etiqueta los
  inactivos y los conserva para leer historial.
- `actualizar_mantenimiento(...)`: valida rol, autoría (responsable o admin),
  edición de completadas solo por admin, transiciones permitidas, campos
  obligatorios, responsable activo solo si cambia, equipo activo y motivo de
  cambio de estado.
- `indicadores_mantenimiento()` y `equipos_revision_vencida()`: solo equipos
  activos; revisión vencida = `proxima_revision <= current_date` y estado
  distinto de `completado`.
- `mantenimiento_cambios_estado` es de solo lectura para clientes; solo la
  escriben las RPC.

**Transiciones permitidas**

| Estado anterior | Estados destino |
|---|---|
| `pendiente` | `en_proceso`, `completado` |
| `en_proceso` | `completado` |
| `completado` | Ninguno (solo edición por administrador, sin cambio de estado) |

No se permite retroceder. Toda transición queda registrada con usuario y fecha.

## 7. Estados y transiciones (equipo)

Los estados operativos destino son `operativo`, `con_fallas`,
`en_mantenimiento`, `inoperativo` y `en_almacen`. Al completar no se admite
`en_mantenimiento`. Cualquier cambio respecto al estado anterior exige motivo y
se registra en `mantenimiento_cambios_estado` junto con la transición de la
intervención.

## 8. Integración con otros módulos

- [Equipos](./equipos.md): historial en la ficha y cambio de estado operativo.
- [Dashboard](./dashboard.md): indicadores de mantenimiento.
- [Reportes](./reportes.md): exportación con técnico, componentes, resultado,
  observaciones, estado del equipo y transiciones.
- [Usuarios y permisos](./usuarios-permisos.md): roles, cuentas activas y RLS.

## 9. Tablas y funciones utilizadas

- Tablas: `mantenimientos`, `mantenimiento_cambios_estado`, `equipos`,
  `profiles`, `auditoria`.
- Funciones: `registrar_mantenimiento`, `actualizar_mantenimiento`,
  `listar_tecnicos_mantenimiento`, `indicadores_mantenimiento` y
  `equipos_revision_vencida`.
- Índices: por fecha, equipo/fecha, responsable/fecha, próxima revisión y los
  dos índices de `mantenimiento_cambios_estado`.

Especificación en [estructura de tablas](../base-datos/01-estructura-tablas.md),
[relaciones y restricciones](../base-datos/02-relaciones-y-restricciones.md) y
[seguridad RLS](../base-datos/03-seguridad-rls-y-auditoria.md). No se reproducen
consultas SQL completas aquí.

## 10. Archivos y funciones relacionadas

- `src/pages/Mantenimientos.tsx` — formularios, filtros, tarjetas y acciones.
- `src/services/mantenimientosService.ts` — tipos, listado paginado y llamadas
  a RPC.
- `supabase/migrations/008_modulo_mantenimientos.sql` — columnas, índices y
  registro inicial.
- `supabase/migrations/009_tecnicos_activos_mantenimiento.sql` — técnicos
  activos/inactivos.
- `supabase/migrations/013_cierre_mantenimientos.sql` — cierre, transiciones,
  trazabilidad, indicadores y bloqueo de escrituras.
- `supabase/tests/rls.sql` — matrices RLS de mantenimiento y ciclo.

## 11. Filtros, búsquedas, indicadores y paginación

Los filtros visibles son **equipo**, **técnico responsable**, **estado de la
intervención**, **tipo**, **desde** y **hasta**, con botones «Actualizar»,
«Ver historial completo» / «Ver últimos registros» y «Limpiar filtros». El
filtro de **estado del equipo** (`estadoEquipo`) y el de **revisión vencida**
(`revision=vencida`) se aceptan por parámetros de URL y por el servicio, pero
no tienen control visible en la interfaz actual.

Indicadores: equipos pendientes, equipos en proceso, equipos con revisión
vencida e intervenciones del mes. Orden por fecha de creación o de mantenimiento
(más reciente primero). Paginación de **10 registros por página** con control de
páginas.

## 12. Limitaciones conocidas

- Frontend y base de datos no aceptan exactamente los mismos estados de alta:
  la RPC admite `en_proceso` y `completado`, la interfaz solo `pendiente`.
- Los filtros `estadoEquipo` y `revisionVencida` solo son accesibles por URL.
- «Revisión vencida» no significa «última intervención completada vencida»: se
  cuentan intervenciones no completadas con fecha pasada.
- `descripcion` se mantiene como espejo de `problema_reportado` por
  compatibilidad con registros históricos.
- Un técnico inactivo puede aparecer en el historial, pero no se le puede
  asignar una intervención nueva.

## 13. Pruebas realizadas y pendientes

**Realizadas o registradas en entregas anteriores**

- Corrección de indicadores, transiciones, validaciones, trazabilidad y bloqueo
  de escrituras incorporada con la migración 013 y verificada por inspección y
  validaciones locales; detalle en el
  [informe de auditoría](../historico/auditoria-cierre-2026-10-25.md).
- Matriz automatizada general registrada como 137 pruebas aprobadas, una
  omitida y cero fallos en el
  [registro de equipos compartidos](../historico/entrega-equipos-compartidos.md).
  No es una prueba exclusiva de mantenimientos.

**Pendientes en staging**

- Ciclo completo: asignación, inicio, cierre con datos obligatorios, motivo de
  cambio de estado, edición de completadas solo por admin y rechazo de
  escrituras directas.
- Ejecutar `supabase/tests/rls.sql` completo y comprobar que no devuelve filas
  `FALLA`.
- Verificar los indicadores frente a datos de prueba.

## 14. Referencias

- [Equipos](./equipos.md)
- [Usuarios y permisos](./usuarios-permisos.md)
- [Plan de pruebas](../pruebas/plan-pruebas.md)
- [Discrepancias conocidas](../discrepancias-conocidas.md) — numerales 2, 3 y 5.
