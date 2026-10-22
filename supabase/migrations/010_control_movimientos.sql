begin;

alter table public.movimientos
  add column if not exists fecha_movimiento date;

update public.movimientos
set fecha_movimiento = created_at::date
where fecha_movimiento is null;

alter table public.movimientos
  alter column fecha_movimiento set default current_date,
  alter column fecha_movimiento set not null,
  add column if not exists responsable_anterior_id uuid references public.profiles(id),
  add column if not exists responsable_nuevo_id uuid references public.profiles(id),
  add column if not exists posicion_anterior text,
  add column if not exists posicion_nueva text;

alter table public.movimientos
  drop constraint if exists movimientos_check;

alter table public.movimientos
  add constraint movimientos_check check (
    (
      responsable_anterior_id is null
      and responsable_nuevo_id is null
      and posicion_anterior is null
      and posicion_nueva is null
    )
    or ambiente_origen_id is distinct from ambiente_destino_id
    or responsable_anterior_id is distinct from responsable_nuevo_id
    or posicion_anterior is distinct from posicion_nueva
  );

create index if not exists movimientos_fecha_idx
  on public.movimientos (fecha_movimiento desc);

create index if not exists movimientos_equipo_fecha_idx
  on public.movimientos (equipo_id, fecha_movimiento desc);

revoke insert, update, delete on public.movimientos from authenticated;

create or replace function public.registrar_movimiento(
  p_equipo_id uuid,
  p_ambiente_destino_id uuid,
  p_responsable_nuevo_id uuid,
  p_fecha_movimiento date,
  p_motivo text,
  p_posicion_nueva text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_ambiente_anterior uuid;
  v_responsable_anterior uuid;
  v_posicion_anterior text;
  v_movimiento_id uuid;
begin
  if v_usuario is null
     or not private.tiene_rol(array['admin', 'tecnico']) then
    raise exception 'Solo un administrador o técnico activo puede registrar movimientos.';
  end if;

  if p_fecha_movimiento is null or p_motivo is null
     or length(btrim(p_motivo)) = 0 then
    raise exception 'La fecha y el motivo son obligatorios.';
  end if;
  if length(btrim(p_motivo)) > 1000 then
    raise exception 'El motivo no puede superar los 1000 caracteres.';
  end if;
  if p_posicion_nueva is not null and length(btrim(p_posicion_nueva)) > 100 then
    raise exception 'La nueva posición no puede superar los 100 caracteres.';
  end if;

  select e.ambiente_id, e.responsable_id, e.posicion
  into v_ambiente_anterior, v_responsable_anterior, v_posicion_anterior
  from public.equipos e
  where e.id = p_equipo_id and e.situacion = 'activo'
  for update;

  if not found then
    raise exception 'El equipo no existe o está dado de baja.';
  end if;

  if p_ambiente_destino_id is distinct from v_ambiente_anterior
     and p_ambiente_destino_id is not null and not exists (
    select 1
    from public.ambientes a
    where a.id = p_ambiente_destino_id and a.activo
  ) then
    raise exception 'El ambiente de destino no existe o está inactivo.';
  end if;

  if p_responsable_nuevo_id is distinct from v_responsable_anterior
     and p_responsable_nuevo_id is not null and not exists (
    select 1
    from public.profiles p
    where p.id = p_responsable_nuevo_id and p.activo
  ) then
    raise exception 'El nuevo responsable no existe o está inactivo.';
  end if;

  if v_ambiente_anterior is not distinct from p_ambiente_destino_id
     and v_responsable_anterior is not distinct from p_responsable_nuevo_id
     and v_posicion_anterior is not distinct from nullif(btrim(p_posicion_nueva), '') then
    raise exception 'Indica una nueva ubicación o un nuevo responsable.';
  end if;

  insert into public.movimientos (
    equipo_id,
    ambiente_origen_id,
    ambiente_destino_id,
    motivo,
    responsable_id,
    responsable_anterior_id,
    responsable_nuevo_id,
    fecha_movimiento,
    posicion_anterior,
    posicion_nueva
  )
  values (
    p_equipo_id,
    v_ambiente_anterior,
    p_ambiente_destino_id,
    btrim(p_motivo),
    v_usuario,
    v_responsable_anterior,
    p_responsable_nuevo_id,
    p_fecha_movimiento,
    v_posicion_anterior,
    nullif(btrim(p_posicion_nueva), '')
  )
  returning id into v_movimiento_id;

  update public.equipos
  set ambiente_id = p_ambiente_destino_id,
      responsable_id = p_responsable_nuevo_id,
      posicion = nullif(btrim(p_posicion_nueva), '')
  where id = p_equipo_id;

  return v_movimiento_id;
end;
$$;

create or replace function private.validar_cambio_asignacion_equipo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.ambiente_id is not distinct from new.ambiente_id
     and old.responsable_id is not distinct from new.responsable_id
     and old.posicion is not distinct from new.posicion then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if not private.tiene_rol(array['admin', 'tecnico']) then
    raise exception 'Solo un administrador o técnico activo puede cambiar asignaciones.';
  end if;

  if not exists (
    select 1
    from public.movimientos m
    where m.equipo_id = old.id
      and m.ambiente_origen_id is not distinct from old.ambiente_id
      and m.ambiente_destino_id is not distinct from new.ambiente_id
      and m.responsable_anterior_id is not distinct from old.responsable_id
      and m.responsable_nuevo_id is not distinct from new.responsable_id
      and m.posicion_anterior is not distinct from old.posicion
      and m.posicion_nueva is not distinct from new.posicion
      and m.responsable_id = auth.uid()
      and m.created_at >= transaction_timestamp()
  ) then
    raise exception 'Registra primero el movimiento para conservar el historial de ubicación y responsable.';
  end if;

  return new;
end;
$$;

revoke all on function private.validar_cambio_asignacion_equipo()
  from public, anon, authenticated;

drop trigger if exists validar_cambio_asignacion_equipo on public.equipos;
create trigger validar_cambio_asignacion_equipo
  before update of ambiente_id, responsable_id, posicion on public.equipos
  for each row execute function private.validar_cambio_asignacion_equipo();

create or replace function public.listar_movimientos(
  p_equipo_id uuid default null,
  p_desde date default null,
  p_hasta date default null,
  p_limite integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  equipo_id uuid,
  codigo_institucional text,
  equipo_nombre text,
  ambiente_origen_id uuid,
  ubicacion_origen text,
  ambiente_destino_id uuid,
  ubicacion_destino text,
  responsable_anterior_id uuid,
  responsable_anterior text,
  responsable_nuevo_id uuid,
  responsable_nuevo text,
  posicion_anterior text,
  posicion_nueva text,
  responsable_id uuid,
  actor text,
  fecha_movimiento date,
  motivo text,
  created_at timestamptz,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not private.tiene_rol(array['admin', 'tecnico']) then
    raise exception 'No tienes permiso para consultar el historial de movimientos.';
  end if;

  if p_limite is null or p_limite < 1 or p_limite > 100
     or p_offset is null or p_offset < 0 then
    raise exception 'Los parámetros de paginación no son válidos.';
  end if;

  return query
  select
    m.id,
    m.equipo_id,
    e.codigo_institucional,
    e.nombre,
    m.ambiente_origen_id,
    nullif(concat_ws(' / ', po.nombre, pi.nombre, ao.codigo, ao.nombre), ''),
    m.ambiente_destino_id,
    nullif(concat_ws(' / ', pd.nombre, pf.nombre, ad.codigo, ad.nombre), ''),
    m.responsable_anterior_id,
    nullif(concat_ws(' ', pa.nombres, pa.apellidos), ''),
    m.responsable_nuevo_id,
    nullif(concat_ws(' ', pn.nombres, pn.apellidos), ''),
    m.posicion_anterior,
    m.posicion_nueva,
    m.responsable_id,
    nullif(concat_ws(' ', px.nombres, px.apellidos), ''),
    m.fecha_movimiento,
    m.motivo,
    m.created_at,
    count(*) over ()
  from public.movimientos m
  join public.equipos e on e.id = m.equipo_id
  left join public.ambientes ao on ao.id = m.ambiente_origen_id
  left join public.pisos pi on pi.id = ao.piso_id
  left join public.pabellones po on po.id = pi.pabellon_id
  left join public.ambientes ad on ad.id = m.ambiente_destino_id
  left join public.pisos pf on pf.id = ad.piso_id
  left join public.pabellones pd on pd.id = pf.pabellon_id
  left join public.profiles pa on pa.id = m.responsable_anterior_id
  left join public.profiles pn on pn.id = m.responsable_nuevo_id
  left join public.profiles px on px.id = m.responsable_id
  where (p_equipo_id is null or m.equipo_id = p_equipo_id)
    and (p_desde is null or m.fecha_movimiento >= p_desde)
    and (p_hasta is null or m.fecha_movimiento <= p_hasta)
  order by m.fecha_movimiento desc, m.created_at desc
  limit p_limite
  offset p_offset;
end;
$$;

create or replace function public.listar_responsables_movimiento()
returns table (
  id uuid,
  nombres text,
  apellidos text,
  rol text,
  activo boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not private.tiene_rol(array['admin', 'tecnico']) then
    raise exception 'No tienes permiso para consultar los responsables.';
  end if;

  return query
  select p.id, p.nombres, p.apellidos, p.rol, p.activo
  from public.profiles p
  where p.activo
  order by p.apellidos, p.nombres;
end;
$$;

revoke all on function public.registrar_movimiento(uuid, uuid, uuid, date, text, text)
  from public, anon;
revoke all on function public.listar_movimientos(uuid, date, date, integer, integer)
  from public, anon;
revoke all on function public.listar_responsables_movimiento()
  from public, anon;

grant execute on function public.registrar_movimiento(uuid, uuid, uuid, date, text, text)
  to authenticated;
grant execute on function public.listar_movimientos(uuid, date, date, integer, integer)
  to authenticated;
grant execute on function public.listar_responsables_movimiento()
  to authenticated;

notify pgrst, 'reload schema';

commit;
