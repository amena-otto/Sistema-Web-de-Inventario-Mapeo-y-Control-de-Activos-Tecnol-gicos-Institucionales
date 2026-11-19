# Movimientos y asignaciones

El módulo de movimientos conserva el historial de traslados y cambios de responsable de cada equipo. La ubicación y la asignación actuales se actualizan como consecuencia de registrar un movimiento, nunca de forma aislada.

## Datos registrados

Cada movimiento almacena:

- equipo, fecha del movimiento y motivo;
- ambiente de origen y ambiente de destino;
- responsable anterior y responsable nuevo;
- posición anterior y posición nueva en el ambiente;
- usuario que registró la operación y fecha de creación del registro.

La migración `010_control_movimientos.sql` añadió `fecha_movimiento`, `responsable_anterior_id`, `responsable_nuevo_id`, `posicion_anterior` y `posicion_nueva`. También creó índices por fecha y por equipo/fecha, revocó inserción, actualización y eliminación directas sobre `movimientos` a `authenticated`, y creó la restricción `movimientos_check` para exigir al menos un cambio real de ubicación, responsable o posición.

## Reglas de negocio

La función `public.registrar_movimiento(...)` es la única vía prevista para registrar movimientos desde la interfaz. Valida que:

- el usuario esté autenticado y tenga rol `admin` o `tecnico` activo;
- la fecha y el motivo sean obligatorios;
- el motivo no supere 1000 caracteres y la posición no supere 100;
- el equipo exista y esté en situación `activo`;
- el ambiente de destino sea válido y esté activo, si se indica;
- el nuevo responsable exista y esté activo, si se indica;
- exista al menos un cambio real respecto de origen, responsable o posición.

La función inserta el movimiento con los valores anteriores del equipo y después actualiza `equipos.ambiente_id`, `equipos.responsable_id` y `equipos.posicion`. El usuario que confirma queda registrado como actor del movimiento.

El trigger `validar_cambio_asignacion_equipo` impide modificar directamente esos tres campos sin un movimiento registrado en la misma transacción por el mismo usuario. Si el cambio se origina fuera de la sesión autenticada (`auth.uid()` nulo), el trigger no bloquea la operación.

## Interfaz

La pantalla **Movimientos y asignaciones** muestra:

- un buscador por código, equipo, origen/destino o motivo;
- filtros por equipo, rango de fechas y paginación de 15 registros;
- para cada movimiento: fecha, actor, ubicación origen/destino, responsable anterior/nuevo, posición anterior/nueva y motivo.

El botón **Registrar movimiento** solo aparece si el perfil tiene el permiso `movimientos.registrar`. El formulario permite seleccionar un equipo activo, nueva ubicación, nuevo responsable, nueva posición, fecha y motivo. Muestra la ubicación, posición y responsable actuales; las opciones inactivas se identifican como no seleccionables. Al guardar, el sistema informa que la ubicación y la asignación actuales fueron actualizadas.

## Consultas y permisos

- `listar_movimientos(...)`: devuelve el historial paginado con nombres de ubicaciones y responsables. Requiere rol `admin` o `tecnico`. Acepta filtros por equipo, fecha desde y fecha hasta; `p_limite` está acotado a 1–100.
- `listar_responsables_movimiento()`: devuelve el personal activo. Requiere rol `admin` o `tecnico`.
- Las funciones se ejecutan con `security definer` y `search_path` vacío; se revocó su acceso a `public` y `anon` y se concedió ejecución a `authenticated`.

## Puntos de validación

- Todo cambio de ubicación, responsable o posición debe tener un movimiento asociado.
- Un equipo dado de baja no debe admitir nuevos movimientos.
- No deben existir movimientos sin cambio efectivo.
- Las fechas y los motivos deben permanecer completos en el histórico.
- La interfaz debe distinguir entre responsable o ubicación inactivos y ausencia de responsable o ubicación.

## Fuentes

- `supabase/migrations/010_control_movimientos.sql`
- `src/pages/Movimientos.tsx`
- `src/services/movimientosService.ts`
- `src/components/SearchableSelect.tsx`
