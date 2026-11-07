begin;

-- Registro de archivos y eliminacion en UNA transaccion. Instalacion sin DML.
alter table public.eliminaciones_pendientes
  add column if not exists bloqueo_token uuid,
  add column if not exists bloqueo_hasta timestamptz;

create or replace function public.reclamar_limpieza_equipo(p_equipo_id uuid, p_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.equipos_eliminados where equipo_id = p_equipo_id)
     or exists (select 1 from public.equipos where id = p_equipo_id) then
    raise exception 'La eliminacion no esta confirmada.';
  end if;
  update public.eliminaciones_pendientes
    set bloqueo_token = p_token, bloqueo_hasta = now() + interval '15 minutes'
    where equipo_id = p_equipo_id
      and (bloqueo_hasta is null or bloqueo_hasta < now());
  return found;
end;
$$;
revoke all on function public.reclamar_limpieza_equipo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reclamar_limpieza_equipo(uuid, uuid) to service_role;

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

  if p_codigo_institucional is null then
    raise exception 'El código institucional no coincide.'
      using errcode = '22023';
  end if;

  -- Propaga al actor a auth.uid() para que los triggers de auditoría
  -- registren exactamente quién ejecutó la baja definitiva.
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_actor_id, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);

  perform pg_advisory_xact_lock(hashtextextended(p_equipo_id::text, 0));

  select *
    into v_equipo
  from public.equipos e
  where e.id = p_equipo_id
    and e.situacion = 'baja'
  for update;

  if not found then
    -- Reintento de una eliminación ya confirmada: se considera exitoso.
    if exists (
      select 1
      from public.equipos_eliminados ee
      where ee.equipo_id = p_equipo_id
        and ee.codigo_institucional = btrim(p_codigo_institucional)
    ) then
      return;
    end if;

    raise exception 'El equipo no existe o no está dado de baja.'
      using errcode = 'P0002';
  end if;

  if btrim(p_codigo_institucional) <> v_equipo.codigo_institucional then
    raise exception 'El código institucional no coincide.'
      using errcode = '22023';
  end if;

  -- Bloquea escrituras de fotografias durante la captura y purga. No cambia
  -- registros durante la instalacion; estos bloqueos solo ocurren al invocar RPC.
  lock table public.fotografias_equipos in share row exclusive mode;

  if exists (
    select 1 from public.fotografias_equipos f
    join public.fotografias_equipos otra on otra.equipo_id <> f.equipo_id
      and ((nullif(f.ruta_storage, '') is not null and otra.ruta_storage = f.ruta_storage)
        or (nullif(f.drive_file_id, '') is not null and otra.drive_file_id = f.drive_file_id))
    where f.equipo_id = p_equipo_id
  ) then
    raise exception 'Existen fotografias compartidas con otro equipo; revise las referencias antes de eliminar.';
  end if;

  insert into public.eliminaciones_pendientes (
    equipo_id, codigo_institucional, rutas_storage, drive_file_ids, creado_por
  )
  select p_equipo_id, v_equipo.codigo_institucional,
    coalesce(array_agg(distinct f.ruta_storage) filter (where nullif(f.ruta_storage, '') is not null), '{}'::text[]),
    coalesce(array_agg(distinct f.drive_file_id) filter (where nullif(f.drive_file_id, '') is not null), '{}'::text[]),
    p_actor_id
  from public.fotografias_equipos f where f.equipo_id = p_equipo_id
  on conflict (equipo_id) do update set
    rutas_storage = excluded.rutas_storage, drive_file_ids = excluded.drive_file_ids,
    storage_limpiado = false, drive_limpiado = false, creado_por = excluded.creado_por, actualizado_at = now();

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
  )
  on conflict (equipo_id) do nothing;

  delete from public.relaciones_equipos
    where equipo_principal_id = p_equipo_id
       or equipo_relacionado_id = p_equipo_id;
  delete from public.componentes where equipo_id = p_equipo_id;
  delete from public.fotografias_equipos where equipo_id = p_equipo_id;

  -- La tabla de trazabilidad de mantenimientos puede no existir todavía en
  -- entornos antiguos; si existe, se limpia explícitamente porque su columna
  -- equipo_id no tiene clave foránea hacia equipos.
  if to_regclass('public.mantenimiento_cambios_estado') is not null then
    delete from public.mantenimiento_cambios_estado where equipo_id = p_equipo_id;
  end if;

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
