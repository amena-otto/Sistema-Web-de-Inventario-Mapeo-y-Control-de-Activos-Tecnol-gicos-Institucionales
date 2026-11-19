# Flujo automático de mantenimientos

Rama: `feat/flujo-mantenimientos-automatico`. Base: `HEAD` de la instalación, sin
tocar la reorganización documental de `docs/reorganizacion-integral`.

Este documento describe únicamente el módulo de Mantenimientos. No reemplaza ni
modifica `documentacion/modulos/mantenimientos.md` ni los documentos históricos;
cuando ambas ramas se integren, el contenido debe fusionarse conservando el
trabajo documental previo.

## Cambios funcionales

- El formulario de registro exige buscar y seleccionar el equipo por escrito. La
  búsqueda ignora mayúsculas y tildes, admite coincidencias parciales por nombre,
  código institucional, serie, categoría y ubicación, y muestra nombre, código,
  serie, categoría y ubicación en cada resultado. Puede elegirse con clic o con
  teclado, se conserva la selección aunque la lista cambie y avisa cuando no hay
  coincidencias. Los resultados se piden por páginas de 20 y el servidor limita
  cada página a 100 filas, con opción de cargar más.
- El alta siempre guarda la intervención como `pendiente` y no muestra selector
  de estado operativo. No modifica el estado del equipo.
- `Iniciar mantenimiento` pide confirmación y, en una sola transacción, marca la
  intervención como `en_proceso`, guarda la fecha y hora reales, el usuario y el
  estado operativo previo, pone el equipo en `en_mantenimiento` y registra la
  transición en `mantenimiento_cambios_estado`.
- Durante `en_proceso` se pueden registrar avances cronológicos e inmutables con
  diagnóstico, acciones, componentes, observaciones y próximo seguimiento. Cada
  avance queda asociado al usuario y a su fecha real, sin crear otra intervención
  ni alterar la fecha real de inicio.
- `Finalizar mantenimiento` exige diagnóstico, acciones, resultado y la elección
  explícita del estado operativo final entre `operativo`, `con_fallas` e
  `inoperativo`. Registra la fecha y hora reales, el usuario, la transición y el
  historial en la misma transacción. No asume que finalizar implica operatividad.
- Las fechas quedan separadas: `fecha_mantenimiento` es la fecha programada,
  `fecha_inicio_real` y `fecha_finalizacion_real` son reales,
  `proximo_seguimiento` pertenece a la intervención abierta y `proxima_revision`
  es la revisión preventiva posterior al cierre.
- No se puede abrir una segunda intervención `en_proceso` para el mismo equipo.
  El mensaje indica el UUID de la intervención bloqueante y ofrece ver el
  historial filtrado por ese equipo. Los duplicados históricos no se borran ni
  se corrigen automáticamente.
- Mientras existe una intervención `en_proceso`, un usuario con sesión no puede
  cambiar manualmente el estado operativo del equipo. Las operaciones sin sesión
  (por ejemplo, la baja definitiva) conservan su comportamiento. Un administrador
  puede aplicar una corrección solo con motivo y queda auditada.
- Se conservan roles, permisos, RLS, paginación, filtros, indicadores, reportes y
  auditoría. Las acciones principales usan naranja institucional y el azul se
  reserva para avances y lectura de historial.

## Datos y estructura

La migración `021_flujo_mantenimientos_automatico.sql` es nueva, incremental e
idempotente. No reescribe migraciones históricas ni modifica registros reales.

- Agrega columnas anulables a `mantenimientos` para fechas reales, usuarios,
  estado previo y seguimiento. Las intervenciones históricas conservan esos
  valores en `NULL`; no se inventan fechas ni estados.
- Crea `mantenimiento_avances` con RLS de solo lectura para `authenticated`,
  índice cronológico, auditoría en inserción y un trigger que impide editar o
  borrar avances.
- Crea o reemplaza las RPC `registrar_mantenimiento`, `actualizar_mantenimiento`,
  `iniciar_mantenimiento`, `guardar_avance_mantenimiento`,
  `finalizar_mantenimiento`, `buscar_equipos_mantenimiento`,
  `normalizar_busqueda_mantenimientos` y
  `corregir_estado_operativo_en_mantenimiento`. No cambia firmas de RPC ya
  desplegadas fuera de las necesarias para el nuevo flujo.
- Crea un índice único parcial y un trigger para impedir un segundo
  `en_proceso` por equipo, y un trigger diferido que protege el estado operativo
  durante la intervención. Si existen duplicados históricos, omite el índice y
  avisa, sin eliminar ni alterar filas.
- Otorga ejecución solo a `authenticated`; `anon` y acceso directo a avances
  quedan sin permisos de escritura.

`SearchableSelect` conserva su API anterior: los selectores existentes siguen
filtrando en local. Las opciones nuevas (`remoto`, `onBuscar`, `detalle`,
`selectedLabel`, `onCargarMas`, `hayMas`, `buscando`) solo se usan en el
selector de equipos del registro de mantenimientos.

## Verificación ejecutada sin producción

- `npm run lint`: correcto.
- `npm run build`: correcto.
- `npm test`: 138 pruebas existentes y 14 pruebas nuevas de PGlite, todas
  aprobadas, cero fallos.
- Pruebas nuevas: idempotencia de la migración, columnas nulas en históricos,
  alta pendiente sin tocar el equipo, inicio atómico con auditoría, bloqueo de
  doble `en_proceso` con UUID del bloqueante, avances inmutables y sin reinicio,
  cierre inválido y válido, búsqueda sin tildes por todos los campos,
  paginación y límite, protección del estado operativo, excepción administrativa,
  rollback transaccional, RLS y conservación de duplicados históricos.

No se conectó ni modificó la base real, no se ejecutaron migraciones en
producción y no se desplegó ni fusionó la rama.

## Pendiente en staging

- Aplicar `021` sobre una copia del esquema real, después de verificar que no
  existen duplicados `en_proceso` que impidan crear el índice único.
- Revisar visualmente el selector de equipos y el flujo completo en escritorio y
  celular, incluida navegación por teclado, ARIA y conservación de la selección.
- Confirmar que indicadores, filtros y reportes siguen reflejando los estados
  `pendiente`, `en_proceso` y `completado` tras la migración.
- Verificar la plantilla de permisos real de Supabase, porque el arnés de
  pruebas reproduce `auth.uid()` y `private.tiene_rol` con variables de sesión.
