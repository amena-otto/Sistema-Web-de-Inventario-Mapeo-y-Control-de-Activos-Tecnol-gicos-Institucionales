begin;

alter table public.pisos
  add column if not exists plano_storage_path text;

insert into public.pabellones (nombre, descripcion, activo)
values
  ('Pabellón A', 'Pabellón institucional', true),
  ('Pabellón B', 'Pabellón institucional', true),
  ('Pabellón C', 'Incluye laboratorios de cómputo', true),
  ('Pabellón D', 'Pabellón institucional', true)
on conflict (nombre) do nothing;

insert into public.pisos (pabellon_id, nombre, numero, activo)
select p.id, 'Piso ' || n.numero, n.numero, true
from public.pabellones p
cross join lateral (
  select generate_series(
    1,
    case when p.nombre in ('Pabellón A', 'Pabellón B') then 4 else 2 end
  ) as numero
) n
where p.nombre in ('Pabellón A', 'Pabellón B', 'Pabellón C', 'Pabellón D')
on conflict (pabellon_id, nombre) do nothing;

insert into public.ambientes (piso_id, codigo, nombre, tipo, activo)
select p.id, 'LAB-COMP-' || lpad(p.numero::text, 2, '0'),
       'Laboratorio de Cómputo ' || p.numero, 'laboratorio', true
from public.pisos p
join public.pabellones b on b.id = p.pabellon_id
where b.nombre = 'Pabellón C' and p.numero in (1, 2)
on conflict (piso_id, codigo) do nothing;

create table if not exists public.marcadores_mapa (
  equipo_id uuid primary key references public.equipos(id),
  piso_id uuid not null references public.pisos(id),
  x numeric(6, 3) not null check (x between 0 and 100),
  y numeric(6, 3) not null check (y between 0 and 100),
  updated_at timestamptz not null default now()
);

create index if not exists marcadores_mapa_piso_idx
  on public.marcadores_mapa (piso_id);

alter table public.marcadores_mapa enable row level security;
grant select, insert, update on public.marcadores_mapa to authenticated;

drop policy if exists marcadores_mapa_leer
  on public.marcadores_mapa;
create policy marcadores_mapa_leer
  on public.marcadores_mapa for select to authenticated
  using ((select private.tiene_rol(array['admin', 'tecnico', 'consulta'])));

drop policy if exists marcadores_mapa_limitar_lectura
  on public.marcadores_mapa;
create policy marcadores_mapa_limitar_lectura
  on public.marcadores_mapa as restrictive for select to authenticated
  using ((select private.tiene_rol(array['admin', 'tecnico', 'consulta'])));

drop policy if exists marcadores_mapa_escribir
  on public.marcadores_mapa;
create policy marcadores_mapa_escribir
  on public.marcadores_mapa for insert to authenticated
  with check ((select private.tiene_rol(array['admin', 'tecnico'])));

drop policy if exists marcadores_mapa_limitar_insercion
  on public.marcadores_mapa;
create policy marcadores_mapa_limitar_insercion
  on public.marcadores_mapa as restrictive for insert to authenticated
  with check ((select private.tiene_rol(array['admin', 'tecnico'])));

drop policy if exists marcadores_mapa_actualizar
  on public.marcadores_mapa;
create policy marcadores_mapa_actualizar
  on public.marcadores_mapa for update to authenticated
  using ((select private.tiene_rol(array['admin', 'tecnico'])))
  with check ((select private.tiene_rol(array['admin', 'tecnico'])));

drop policy if exists marcadores_mapa_limitar_actualizacion
  on public.marcadores_mapa;
create policy marcadores_mapa_limitar_actualizacion
  on public.marcadores_mapa as restrictive for update to authenticated
  using ((select private.tiene_rol(array['admin', 'tecnico'])))
  with check ((select private.tiene_rol(array['admin', 'tecnico'])));

create or replace function private.validar_marcador_mapa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_piso uuid;
  v_situacion text;
begin
  select a.piso_id, e.situacion
    into v_piso, v_situacion
  from public.equipos e
  join public.ambientes a on a.id = e.ambiente_id
  where e.id = new.equipo_id;

  if v_piso is null or v_situacion <> 'activo' then
    raise exception 'El equipo debe estar activo y asignado a un ambiente para ubicarlo en el plano.';
  end if;

  if new.piso_id <> v_piso then
    raise exception 'El marcador debe estar en el piso de la ubicación actual del equipo.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.validar_marcador_mapa()
  from public, anon, authenticated;

drop trigger if exists validar_marcador_mapa
  on public.marcadores_mapa;
create trigger validar_marcador_mapa
  before insert or update on public.marcadores_mapa
  for each row execute function private.validar_marcador_mapa();

create or replace function private.limpiar_marcador_al_mover_equipo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_piso_anterior uuid;
  v_piso_nuevo uuid;
begin
  if old.ambiente_id is not distinct from new.ambiente_id
     and old.situacion is not distinct from new.situacion then
    return new;
  end if;

  select piso_id into v_piso_anterior
  from public.ambientes where id = old.ambiente_id;

  select piso_id into v_piso_nuevo
  from public.ambientes where id = new.ambiente_id;

  if v_piso_anterior is distinct from v_piso_nuevo
     or new.situacion <> 'activo' then
    delete from public.marcadores_mapa where equipo_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.limpiar_marcador_al_mover_equipo()
  from public, anon, authenticated;

drop trigger if exists limpiar_marcador_al_mover_equipo
  on public.equipos;
create trigger limpiar_marcador_al_mover_equipo
  after update of ambiente_id, situacion on public.equipos
  for each row execute function private.limpiar_marcador_al_mover_equipo();

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'planos-institucionales',
  'planos-institucionales',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists planos_institucionales_leer
  on storage.objects;
create policy planos_institucionales_leer
  on storage.objects for select to authenticated
  using (
    bucket_id = 'planos-institucionales'
    and (select private.tiene_rol(array['admin', 'tecnico', 'consulta']))
  );

drop policy if exists planos_institucionales_subir
  on storage.objects;
create policy planos_institucionales_subir
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'planos-institucionales'
    and (select private.tiene_rol(array['admin']))
    and (storage.foldername(name))[1] = 'pisos'
    and exists (
      select 1 from public.pisos p
      where p.id::text = (storage.foldername(name))[2]
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'pisos'
    ) then
      alter publication supabase_realtime add table public.pisos;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'equipos'
    ) then
      alter publication supabase_realtime add table public.equipos;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'ambientes'
    ) then
      alter publication supabase_realtime add table public.ambientes;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'marcadores_mapa'
    ) then
      alter publication supabase_realtime add table public.marcadores_mapa;
    end if;
  end if;
end;
$$;

commit;
