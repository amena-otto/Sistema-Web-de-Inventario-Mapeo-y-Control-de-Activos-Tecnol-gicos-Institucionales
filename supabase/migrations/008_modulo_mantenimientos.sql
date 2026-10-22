begin;

alter table public.mantenimientos
  add column if not exists fecha_mantenimiento date,
  add column if not exists problema_reportado text,
  add column if not exists diagnostico text,
  add column if not exists acciones_realizadas text,
  add column if not exists componentes_reemplazados text,
  add column if not exists resultado text,
  add column if not exists observaciones text,
  add column if not exists proxima_revision date;

update public.mantenimientos
set fecha_mantenimiento = created_at::date
where fecha_mantenimiento is null;

update public.mantenimientos
set problema_reportado = descripcion
where problema_reportado is null and descripcion is not null;

alter table public.mantenimientos
  alter column fecha_mantenimiento set default current_date,
  alter column fecha_mantenimiento set not null;

create index if not exists mantenimientos_fecha_idx
  on public.mantenimientos (fecha_mantenimiento desc);

create index if not exists mantenimientos_equipo_fecha_idx
  on public.mantenimientos (equipo_id, fecha_mantenimiento desc);

create index if not exists mantenimientos_responsable_fecha_idx
  on public.mantenimientos (responsable_id, fecha_mantenimiento desc);

create index if not exists mantenimientos_proxima_revision_idx
  on public.mantenimientos (proxima_revision)
  where proxima_revision is not null;

create or replace function public.registrar_mantenimiento(
  p_equipo_id uuid,
  p_tipo text,
  p_fecha_mantenimiento date,
  p_problema_reportado text,
  p_diagnostico text,
  p_acciones_realizadas text,
  p_componentes_reemplazados text,
  p_resultado text,
  p_observaciones text,
  p_proxima_revision date,
  p_estado text,
  p_estado_equipo text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_mantenimiento_id uuid;
begin
  if v_usuario is null
     or not private.tiene_rol(array['admin', 'tecnico']) then
    raise exception 'Solo un administrador o técnico activo puede registrar mantenimientos.';
  end if;

  if p_tipo is null or p_tipo not in ('preventivo', 'correctivo') then
    raise exception 'El tipo de mantenimiento no es válido.';
  end if;

  if p_estado is null or p_estado not in ('pendiente', 'en_proceso', 'completado') then
    raise exception 'El estado del mantenimiento no es válido.';
  end if;

  if p_fecha_mantenimiento is null
     or p_problema_reportado is null
     or length(btrim(p_problema_reportado)) = 0 then
    raise exception 'La fecha y el problema reportado son obligatorios.';
  end if;

  if p_proxima_revision is not null
     and p_proxima_revision < p_fecha_mantenimiento then
    raise exception 'La próxima revisión no puede ser anterior al mantenimiento.';
  end if;

  if p_estado_equipo is not null
     and p_estado_equipo not in (
       'operativo', 'con_fallas', 'en_mantenimiento', 'inoperativo', 'en_almacen'
     ) then
    raise exception 'El estado operativo del equipo no es válido.';
  end if;

  perform 1
  from public.equipos
  where id = p_equipo_id and situacion = 'activo'
  for update;

  if not found then
    raise exception 'El equipo no existe o está dado de baja.';
  end if;

  insert into public.mantenimientos (
    equipo_id,
    tipo,
    fecha_mantenimiento,
    descripcion,
    problema_reportado,
    diagnostico,
    acciones_realizadas,
    componentes_reemplazados,
    resultado,
    observaciones,
    proxima_revision,
    estado,
    responsable_id
  )
  values (
    p_equipo_id,
    p_tipo,
    p_fecha_mantenimiento,
    btrim(p_problema_reportado),
    btrim(p_problema_reportado),
    nullif(btrim(p_diagnostico), ''),
    nullif(btrim(p_acciones_realizadas), ''),
    nullif(btrim(p_componentes_reemplazados), ''),
    nullif(btrim(p_resultado), ''),
    nullif(btrim(p_observaciones), ''),
    p_proxima_revision,
    p_estado,
    v_usuario
  )
  returning id into v_mantenimiento_id;

  if p_estado_equipo is not null then
    update public.equipos
    set estado_operativo = p_estado_equipo
    where id = p_equipo_id;
  end if;

  return v_mantenimiento_id;
end;
$$;

create or replace function public.listar_tecnicos_mantenimiento()
returns table (id uuid, nombres text, apellidos text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not private.tiene_rol(array['admin', 'tecnico']) then
    raise exception 'No tienes permiso para consultar los técnicos.';
  end if;

  return query
  select p.id, p.nombres, p.apellidos
  from public.profiles p
  where p.rol in ('admin', 'tecnico')
  order by p.apellidos, p.nombres;
end;
$$;

create or replace function public.indicadores_mantenimiento()
returns table (
  equipos_pendientes bigint,
  equipos_en_proceso bigint,
  equipos_revision_vencida bigint,
  intervenciones_mes bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not private.tiene_rol(array['admin', 'tecnico']) then
    raise exception 'No tienes permiso para consultar los indicadores.';
  end if;

  return query
  select
    count(distinct m.equipo_id) filter (where m.estado = 'pendiente'),
    count(distinct m.equipo_id) filter (where m.estado = 'en_proceso'),
    count(distinct m.equipo_id) filter (
      where m.proxima_revision <= current_date and m.estado <> 'completado'
    ),
    count(*) filter (
      where m.fecha_mantenimiento >= date_trunc('month', current_date)::date
        and m.fecha_mantenimiento <= current_date
    )
  from public.mantenimientos m;
end;
$$;

revoke all on function public.registrar_mantenimiento(
  uuid, text, date, text, text, text, text, text, text, date, text, text
) from public, anon;
revoke all on function public.listar_tecnicos_mantenimiento() from public, anon;
revoke all on function public.indicadores_mantenimiento() from public, anon;

grant execute on function public.registrar_mantenimiento(
  uuid, text, date, text, text, text, text, text, text, date, text, text
) to authenticated;
grant execute on function public.listar_tecnicos_mantenimiento() to authenticated;
grant execute on function public.indicadores_mantenimiento() to authenticated;

commit;
