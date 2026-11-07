begin;

-- Limpieza diferida de archivos de equipos eliminados definitivamente.
--
-- La Edge Function admin-eliminar-equipo registra aquí las rutas de Storage y
-- los identificadores de Google Drive ANTES de ejecutar la RPC transaccional.
-- Solo después de que PostgreSQL confirma la eliminación se tocan los archivos.
-- Si la RPC falla, el equipo y sus fotografías de la base siguen intactos y la
-- fila pendiente permite reintentar la operación sin pérdida de evidencia.
--
-- Si la limpieza de archivos falla o queda incompleta, la fila se conserva para
-- que un reintento del administrador retome solo los archivos pendientes. La
-- fila se elimina únicamente cuando Storage y Drive quedan limpios.
--
-- La tabla es aditiva: no modifica equipos, fotografías ni la auditoría, y es
-- idempotente (puede aplicarse varias veces sin errores).

create table if not exists public.eliminaciones_pendientes (
  equipo_id uuid primary key,
  codigo_institucional text not null,
  rutas_storage text[] not null default '{}'::text[],
  drive_file_ids text[] not null default '{}'::text[],
  storage_limpiado boolean not null default false,
  drive_limpiado boolean not null default false,
  creado_por uuid references public.profiles(id),
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  constraint eliminaciones_pendientes_rutas_check
    check (array_position(rutas_storage, null) is null),
  constraint eliminaciones_pendientes_drive_check
    check (array_position(drive_file_ids, null) is null)
);

comment on table public.eliminaciones_pendientes is
  'Archivos de Storage y Google Drive que deben limpiarse tras eliminar un equipo. La escribe y consume solo la Edge Function admin-eliminar-equipo.';

comment on column public.eliminaciones_pendientes.rutas_storage is
  'Rutas del bucket fotografias-equipos pendientes de eliminar. Se vacía al confirmar la limpieza.';

comment on column public.eliminaciones_pendientes.drive_file_ids is
  'Identificadores de Google Drive pendientes de mover a la papelera. Se reduce lote a lote hasta quedar vacío.';

comment on column public.eliminaciones_pendientes.storage_limpiado is
  'true cuando Storage ya no tiene archivos pendientes para este equipo.';

comment on column public.eliminaciones_pendientes.drive_limpiado is
  'true cuando Google Drive ya no tiene archivos pendientes para este equipo.';

create index if not exists eliminaciones_pendientes_creado_idx
  on public.eliminaciones_pendientes (creado_at desc);

alter table public.eliminaciones_pendientes enable row level security;

-- Sin políticas: la tabla no se expone a la API. Solo service_role, usado por
-- la Edge Function, puede leerla y actualizarla. El cliente nunca la consulta.
revoke all on public.eliminaciones_pendientes
  from public, anon, authenticated;
grant all on public.eliminaciones_pendientes to service_role;

notify pgrst, 'reload schema';

commit;
