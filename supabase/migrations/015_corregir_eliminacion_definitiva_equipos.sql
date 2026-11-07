begin;

-- Corrige la eliminación definitiva de equipos:
--   * quita la referencia obsoleta a public.marcadores_mapa (tabla retirada);
--   * retira, solo si la tabla ya no existe, el trigger y la función antiguos
--     que también dependían de marcadores_mapa;
--   * conserva la firma, los permisos, las validaciones y la auditoría;
--   * permite reintentar la operación sin duplicar la constancia de la baja.
--
-- La migración es idempotente: puede aplicarse varias veces sin errores.
-- No crea ni recrea marcadores_mapa y no altera los seis triggers legítimos
-- de public.equipos (asignar_actor, asignar_codigo_equipo, auditoria_equipos,
-- proteger_equipos, set_updated_at, validar_cambio_asignacion_equipo).

do $$
begin
  if to_regclass('public.marcadores_mapa') is null then
    drop trigger if exists limpiar_marcador_al_mover_equipo on public.equipos;
    drop function if exists private.limpiar_marcador_al_mover_equipo();
  end if;
end;
$$;

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
