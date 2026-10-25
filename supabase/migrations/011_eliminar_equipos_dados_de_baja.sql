begin;

-- A. Constancia permanente de las bajas definitivas ---------------------------
create table if not exists public.equipos_eliminados (
  equipo_id uuid primary key,
  codigo_institucional text not null,
  nombre text not null,
  datos_equipo jsonb not null,
  fotografias_eliminadas integer not null default 0,
  eliminado_por uuid references public.profiles(id),
  eliminado_at timestamptz not null default now()
);

comment on table public.equipos_eliminados is
  'Constancia de equipos eliminados definitivamente. Se conserva aunque se borre el equipo y su historial operativo.';

create index if not exists equipos_eliminados_fecha_idx
  on public.equipos_eliminados (eliminado_at desc);

alter table public.equipos_eliminados enable row level security;

drop policy if exists equipos_eliminados_leer on public.equipos_eliminados;
create policy equipos_eliminados_leer on public.equipos_eliminados
  for select to authenticated
  using ((select private.tiene_rol(array['admin'])));

-- Solo lectura desde la API: la evidencia la escribe la función protegida.
revoke all on public.equipos_eliminados from public, anon, authenticated;
grant select on public.equipos_eliminados to authenticated;

-- B. La auditoría no admite edición ni borrado --------------------------------
create or replace function private.proteger_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'La auditoría es inmutable: no se puede modificar ni eliminar.'
    using errcode = '42501';
end;
$$;

revoke all on function private.proteger_auditoria() from public, anon, authenticated;

drop trigger if exists proteger_auditoria on public.auditoria;
create trigger proteger_auditoria
  before update or delete on public.auditoria
  for each row execute function private.proteger_auditoria();

-- C. Baja definitiva: conserva la auditoría y deja constancia -----------------
-- Elimina la versión anterior de dos argumentos, si se aplicó en staging.
drop function if exists public.eliminar_equipo_dado_de_baja(uuid, text);

create or replace function public.eliminar_equipo_dado_de_baja(
  p_equipo_id uuid,
  p_codigo_institucional text,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_equipo public.equipos%rowtype;
  v_total_fotografias integer;
begin
  if p_actor_id is null
     or not exists (
       select 1
       from public.profiles p
       where p.id = p_actor_id
         and p.rol = 'admin'
         and p.activo
     ) then
    raise exception 'Solo un administrador activo puede eliminar equipos.'
      using errcode = '42501';
  end if;

  -- Propaga al actor a auth.uid() para que los triggers de auditoría
  -- registren exactamente quién ejecutó la baja definitiva.
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_actor_id, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);

  select *
    into v_equipo
  from public.equipos e
  where e.id = p_equipo_id
    and e.situacion = 'baja'
  for update;

  if not found then
    raise exception 'El equipo no existe o no está dado de baja.'
      using errcode = 'P0002';
  end if;

  if p_codigo_institucional is null
     or btrim(p_codigo_institucional) <> v_equipo.codigo_institucional then
    raise exception 'El código institucional no coincide.'
      using errcode = '22023';
  end if;

  select count(*)
    into v_total_fotografias
  from public.fotografias_equipos f
  where f.equipo_id = p_equipo_id;

  insert into public.equipos_eliminados (
    equipo_id,
    codigo_institucional,
    nombre,
    datos_equipo,
    fotografias_eliminadas,
    eliminado_por
  )
  values (
    v_equipo.id,
    v_equipo.codigo_institucional,
    v_equipo.nombre,
    to_jsonb(v_equipo),
    v_total_fotografias,
    p_actor_id
  );

  delete from public.marcadores_mapa where equipo_id = p_equipo_id;
  delete from public.relaciones_equipos
    where equipo_principal_id = p_equipo_id
       or equipo_relacionado_id = p_equipo_id;
  delete from public.componentes where equipo_id = p_equipo_id;
  delete from public.fotografias_equipos where equipo_id = p_equipo_id;
  delete from public.mantenimientos where equipo_id = p_equipo_id;
  delete from public.movimientos where equipo_id = p_equipo_id;
  delete from public.equipos where id = p_equipo_id;
end;
$$;

-- Solo la Edge Function (service_role) puede invocarla. El cliente nunca
-- ejecuta la purga directamente y no puede saltarse la limpieza de archivos.
revoke all on function public.eliminar_equipo_dado_de_baja(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.eliminar_equipo_dado_de_baja(uuid, text, uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
