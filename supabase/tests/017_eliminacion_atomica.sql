-- Ejecutar exclusivamente sobre una restauracion local descartable.
-- Usa equipos ficticios; toda la prueba se revierte.
begin;
do $$
declare
  actor uuid;
  categoria uuid;
  equipo uuid := 'a1111111-1111-4111-8111-111111111111';
  codigo text;
  token uuid := gen_random_uuid();
  n integer;
begin
  if inet_server_addr() is distinct from '127.0.0.1'::inet
     or current_database() <> 'inventory_restore' then
    raise exception 'Esta prueba requiere inventory_restore en loopback.';
  end if;
  select id into actor from public.profiles where rol = 'admin' and activo limit 1;
  select id into categoria from public.categorias_equipos limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', actor::text, true);
  insert into public.equipos (id, categoria_id, nombre, situacion, deleted_at)
    values (equipo, categoria, 'PRUEBA DESCARTABLE 017', 'baja', now())
    returning codigo_institucional into codigo;
  insert into public.fotografias_equipos (equipo_id, drive_file_id)
    select equipo, 'ficticio-drive-' || i from generate_series(1, 151) i;

  begin
    perform public.reclamar_limpieza_equipo(equipo, token);
    raise exception 'FALLO: permitio limpieza anticipada';
  exception when raise_exception then
    if sqlerrm = 'FALLO: permitio limpieza anticipada' then raise; end if;
  end;

  perform public.eliminar_equipo_dado_de_baja(equipo, codigo, actor);
  if exists (select 1 from public.equipos where id = equipo) then
    raise exception 'FALLO: equipo ficticio sigue presente';
  end if;
  select cardinality(drive_file_ids) into n from public.eliminaciones_pendientes where equipo_id = equipo;
  if n is distinct from 151 then raise exception 'FALLO: manifiesto incompleto'; end if;
  if not exists (select 1 from public.equipos_eliminados where equipo_id = equipo and eliminado_por = actor) then
    raise exception 'FALLO: constancia o actor incorrectos';
  end if;
  perform public.eliminar_equipo_dado_de_baja(equipo, codigo, actor);
  if not public.reclamar_limpieza_equipo(equipo, token) then raise exception 'FALLO: primer bloqueo'; end if;
  if public.reclamar_limpieza_equipo(equipo, gen_random_uuid()) then raise exception 'FALLO: doble bloqueo'; end if;
  update public.eliminaciones_pendientes set bloqueo_hasta = now() - interval '1 second' where equipo_id = equipo;
  if not public.reclamar_limpieza_equipo(equipo, gen_random_uuid()) then raise exception 'FALLO: recuperacion'; end if;
  raise notice 'PASS: triggers reales, 151 fotos, RPC idempotente, constancia y bloqueo recuperable';
end;
$$;
rollback;
