begin;

alter table public.fotografias_equipos
  add column if not exists drive_file_id text;

alter table public.fotografias_equipos
  alter column ruta_storage drop not null;

create unique index if not exists fotografias_equipos_drive_file_id_uidx
  on public.fotografias_equipos (drive_file_id)
  where drive_file_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fotografias_equipos_origen_check'
      and conrelid = 'public.fotografias_equipos'::regclass
  ) then
    alter table public.fotografias_equipos
      add constraint fotografias_equipos_origen_check
      check (ruta_storage is not null or drive_file_id is not null);
  end if;
end;
$$;

comment on column public.fotografias_equipos.drive_file_id is
  'Identificador privado del archivo de Google Drive; se sirve mediante la Edge Function fotografias-drive.';

commit;
