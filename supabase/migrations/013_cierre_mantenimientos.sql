begin;

-- A. Trazabilidad de los cambios de estado derivados de una intervención -------
-- Cada fila registra qué ocurrió con la intervención y con el equipo, quién lo
-- hizo, cuándo y por qué. La tabla es de solo lectura para los clientes: las
-- filas las escriben exclusivamente las funciones transaccionales.
create table if not exists public.mantenimiento_cambios_estado (
  id uuid primary key default gen_random_uuid(),
  mantenimiento_id uuid not null
    references public.mantenimientos(id) on delete cascade,
  equipo_id uuid not null,
  estado_mantenimiento_anterior text,
  estado_mantenimiento_nuevo text not null,
  estado_equipo_anterior text,
  estado_equipo_nuevo text,
  motivo text,
  usuario_id uuid,
  created_at timestamptz not null default now(),
  constraint mantenimiento_cambios_estado_mantenimiento_check
    check (estado_mantenimiento_nuevo in ('pendiente', 'en_proceso', 'completado')),
  constraint mantenimiento_cambios_estado_mantenimiento_anterior_check
    check (
      estado_mantenimiento_anterior is null
      or estado_mantenimiento_anterior in ('pendiente', 'en_proceso', 'completado')
    ),
  constraint mantenimiento_cambios_estado_equipo_check
    check (
      estado_equipo_nuevo is null
      or estado_equipo_nuevo in (
        'operativo', 'con_fallas', 'en_mantenimiento', 'inoperativo', 'en_almacen'
      )
    ),
  constraint mantenimiento_cambios_estado_equipo_anterior_check
    check (
      estado_equipo_anterior is null
      or estado_equipo_anterior in (
        'operativo', 'con_fallas', 'en_mantenimiento', 'inoperativo', 'en_almacen'
      )
    )
);

create index if not exists mantenimiento_cambios_estado_mantenimiento_idx
  on public.mantenimiento_cambios_estado (mantenimiento_id, created_at);

create index if not exists mantenimiento_cambios_estado_equipo_idx
  on public.mantenimiento_cambios_estado (equipo_id, created_at desc);

alter table public.mantenimiento_cambios_estado enable row level security;

drop policy if exists mantenimiento_cambios_estado_leer
  on public.mantenimiento_cambios_estado;
create policy mantenimiento_cambios_estado_leer
  on public.mantenimiento_cambios_estado for select to authenticated
  using ((select private.tiene_rol(array['admin', 'tecnico'])));

revoke all on public.mantenimiento_cambios_estado
  from public, anon, authenticated;
grant select on public.mantenimiento_cambios_estado to authenticated;

comment on table public.mantenimiento_cambios_estado is
  'Historial de transiciones de estado de una intervención y del equipo afectado.';

-- B. Registro inicial: permite asignar al técnico responsable y deja constancia
-- del estado del equipo cuando cambia en el alta. Se reemplaza la firma anterior
-- para añadir p_responsable_id con valor por defecto.
drop function if exists public.registrar_mantenimiento(
  uuid, text, date, text, text, text, text, text, text, date, text, text
);

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
  p_estado_equipo text default null,
  p_responsable_id uuid default null,
  p_motivo_estado text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_responsable uuid;
  v_mantenimiento_id uuid;
  v_estado_equipo_anterior text;
  v_estado_equipo_nuevo text;
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

  if p_estado = 'completado'
     and (
       p_diagnostico is null or length(btrim(p_diagnostico)) = 0
       or p_acciones_realizadas is null or length(btrim(p_acciones_realizadas)) = 0
       or p_resultado is null or length(btrim(p_resultado)) = 0
     ) then
    raise exception 'Para completar la intervención debes registrar el diagnóstico, las acciones y el resultado.';
  end if;

  if p_estado_equipo is not null
     and p_estado_equipo not in (
       'operativo', 'con_fallas', 'en_mantenimiento', 'inoperativo', 'en_almacen'
     ) then
    raise exception 'El estado operativo del equipo no es válido.';
  end if;

  -- El técnico solo puede registrarse a sí mismo. Un administrador puede
  -- asignar la intervención a otro técnico activo.
  v_responsable := coalesce(p_responsable_id, v_usuario);
  if p_responsable_id is not null
     and p_responsable_id <> v_usuario
     and not private.tiene_rol(array['admin']) then
    raise exception 'Solo un administrador puede asignar la intervención a otro técnico.';
  end if;

  perform 1
  from public.profiles p
  where p.id = v_responsable
    and p.activo
    and p.rol in ('admin', 'tecnico');
  if not found then
    raise exception 'El técnico responsable no existe o no está activo.';
  end if;

  select e.estado_operativo into v_estado_equipo_anterior
  from public.equipos e
  where e.id = p_equipo_id and e.situacion = 'activo'
  for update;

  if not found then
    raise exception 'El equipo no existe o está dado de baja.';
  end if;

  v_estado_equipo_nuevo := coalesce(p_estado_equipo, v_estado_equipo_anterior);

  if p_estado = 'completado'
     and v_estado_equipo_nuevo = 'en_mantenimiento' then
    raise exception 'Al completar la intervención el equipo no puede quedar en mantenimiento.';
  end if;

  if v_estado_equipo_nuevo is distinct from v_estado_equipo_anterior
     and (p_motivo_estado is null or length(btrim(p_motivo_estado)) = 0) then
    raise exception 'Indica el motivo del cambio de estado del equipo.';
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
    v_responsable
  )
  returning id into v_mantenimiento_id;

  if v_estado_equipo_nuevo is distinct from v_estado_equipo_anterior then
    update public.equipos
    set estado_operativo = v_estado_equipo_nuevo
    where id = p_equipo_id;

    insert into public.mantenimiento_cambios_estado (
      mantenimiento_id,
      equipo_id,
      estado_mantenimiento_anterior,
      estado_mantenimiento_nuevo,
      estado_equipo_anterior,
      estado_equipo_nuevo,
      motivo,
      usuario_id
    )
    values (
      v_mantenimiento_id,
      p_equipo_id,
      null,
      p_estado,
      v_estado_equipo_anterior,
      v_estado_equipo_nuevo,
      nullif(btrim(p_motivo_estado), ''),
      v_usuario
    );
  end if;

  return v_mantenimiento_id;
end;
$$;

revoke all on function public.registrar_mantenimiento(
  uuid, text, date, text, text, text, text, text, text, date, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.registrar_mantenimiento(
  uuid, text, date, text, text, text, text, text, text, date, text, text, uuid, text
) to authenticated;

-- C. Actualización y cierre de una intervención --------------------------------
create or replace function public.actualizar_mantenimiento(
  p_id uuid,
  p_estado text,
  p_problema_reportado text,
  p_diagnostico text,
  p_acciones_realizadas text,
  p_componentes_reemplazados text,
  p_resultado text,
  p_observaciones text,
  p_proxima_revision date,
  p_estado_equipo text default null,
  p_motivo text default null,
  p_responsable_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_equipo_id uuid;
  v_estado_anterior text;
  v_fecha_mantenimiento date;
  v_responsable_actual uuid;
  v_responsable_nuevo uuid;
  v_estado_equipo_anterior text;
  v_estado_equipo_nuevo text;
begin
  if v_usuario is null
     or not private.tiene_rol(array['admin', 'tecnico']) then
    raise exception 'Solo un administrador o técnico activo puede actualizar mantenimientos.';
  end if;

  select
    m.equipo_id,
    m.estado,
    m.fecha_mantenimiento,
    m.responsable_id
  into
    v_equipo_id,
    v_estado_anterior,
    v_fecha_mantenimiento,
    v_responsable_actual
  from public.mantenimientos m
  where m.id = p_id
  for update;

  if not found then
    raise exception 'La intervención no existe.';
  end if;

  if not private.tiene_rol(array['admin'])
     and v_responsable_actual is distinct from v_usuario then
    raise exception 'Solo el técnico responsable o un administrador puede actualizar esta intervención.';
  end if;

  if v_estado_anterior = 'completado'
     and not private.tiene_rol(array['admin']) then
    raise exception 'Solo un administrador puede editar una intervención completada.';
  end if;

  if p_estado is null or p_estado not in ('pendiente', 'en_proceso', 'completado') then
    raise exception 'El estado del mantenimiento no es válido.';
  end if;

  if p_estado <> v_estado_anterior
     and not (
       (v_estado_anterior = 'pendiente' and p_estado in ('en_proceso', 'completado'))
       or (v_estado_anterior = 'en_proceso' and p_estado = 'completado')
     ) then
    raise exception 'La transición de % a % no está permitida.', v_estado_anterior, p_estado;
  end if;

  if p_problema_reportado is null
     or length(btrim(p_problema_reportado)) = 0 then
    raise exception 'El problema reportado es obligatorio.';
  end if;

  if p_proxima_revision is not null
     and p_proxima_revision < v_fecha_mantenimiento then
    raise exception 'La próxima revisión no puede ser anterior al mantenimiento.';
  end if;

  if p_estado = 'completado'
     and (
       p_diagnostico is null or length(btrim(p_diagnostico)) = 0
       or p_acciones_realizadas is null or length(btrim(p_acciones_realizadas)) = 0
       or p_resultado is null or length(btrim(p_resultado)) = 0
     ) then
    raise exception 'Para completar la intervención debes registrar el diagnóstico, las acciones y el resultado.';
  end if;

  if p_estado_equipo is not null
     and p_estado_equipo not in (
       'operativo', 'con_fallas', 'en_mantenimiento', 'inoperativo', 'en_almacen'
     ) then
    raise exception 'El estado operativo del equipo no es válido.';
  end if;

  v_responsable_nuevo := coalesce(p_responsable_id, v_responsable_actual, v_usuario);

  if p_responsable_id is not null
     and p_responsable_id <> coalesce(v_responsable_actual, v_usuario)
     and not private.tiene_rol(array['admin']) then
    raise exception 'Solo un administrador puede reasignar la intervención.';
  end if;

  -- Solo se valida la cuenta cuando el responsable cambia (o es un alta). Así se
  -- puede editar una intervención histórica sin reasignarla, aunque su técnico
  -- ya esté inactivo.
  if v_responsable_nuevo is distinct from v_responsable_actual then
    perform 1
    from public.profiles p
    where p.id = v_responsable_nuevo
      and p.activo
      and p.rol in ('admin', 'tecnico');
    if not found then
      raise exception 'El técnico responsable no existe o no está activo.';
    end if;
  end if;

  select e.estado_operativo into v_estado_equipo_anterior
  from public.equipos e
  where e.id = v_equipo_id and e.situacion = 'activo'
  for update;

  if not found then
    raise exception 'El equipo no existe o está dado de baja.';
  end if;

  v_estado_equipo_nuevo := coalesce(p_estado_equipo, v_estado_equipo_anterior);

  if p_estado = 'completado'
     and v_estado_equipo_nuevo = 'en_mantenimiento' then
    raise exception 'Al completar la intervención el equipo no puede quedar en mantenimiento.';
  end if;

  if v_estado_equipo_nuevo is distinct from v_estado_equipo_anterior
     and (p_motivo is null or length(btrim(p_motivo)) = 0) then
    raise exception 'Indica el motivo del cambio de estado del equipo.';
  end if;

  update public.mantenimientos
  set
    estado = p_estado,
    problema_reportado = btrim(p_problema_reportado),
    descripcion = btrim(p_problema_reportado),
    diagnostico = nullif(btrim(p_diagnostico), ''),
    acciones_realizadas = nullif(btrim(p_acciones_realizadas), ''),
    componentes_reemplazados = nullif(btrim(p_componentes_reemplazados), ''),
    resultado = nullif(btrim(p_resultado), ''),
    observaciones = nullif(btrim(p_observaciones), ''),
    proxima_revision = p_proxima_revision,
    responsable_id = v_responsable_nuevo
  where id = p_id;

  if v_estado_equipo_nuevo is distinct from v_estado_equipo_anterior then
    update public.equipos
    set estado_operativo = v_estado_equipo_nuevo
    where id = v_equipo_id;
  end if;

  if p_estado is distinct from v_estado_anterior
     or v_estado_equipo_nuevo is distinct from v_estado_equipo_anterior then
    insert into public.mantenimiento_cambios_estado (
      mantenimiento_id,
      equipo_id,
      estado_mantenimiento_anterior,
      estado_mantenimiento_nuevo,
      estado_equipo_anterior,
      estado_equipo_nuevo,
      motivo,
      usuario_id
    )
    values (
      p_id,
      v_equipo_id,
      v_estado_anterior,
      p_estado,
      v_estado_equipo_anterior,
      v_estado_equipo_nuevo,
      nullif(btrim(p_motivo), ''),
      v_usuario
    );
  end if;

  return p_id;
end;
$$;

revoke all on function public.actualizar_mantenimiento(
  uuid, text, text, text, text, text, text, text, date, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.actualizar_mantenimiento(
  uuid, text, text, text, text, text, text, text, date, text, text, uuid
) to authenticated;

-- D. Indicadores corregidos ----------------------------------------------------
-- Una revisión vencida es un mantenimiento programado cuya fecha ya pasó y
-- que continúa pendiente de ejecución. No se contabilizan mantenimientos completados.
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
    (
      select count(distinct m.equipo_id)
      from public.mantenimientos m
      join public.equipos e
        on e.id = m.equipo_id and e.situacion = 'activo'
      where m.estado = 'pendiente'
    ),
    (
      select count(distinct m.equipo_id)
      from public.mantenimientos m
      join public.equipos e
        on e.id = m.equipo_id and e.situacion = 'activo'
      where m.estado = 'en_proceso'
    ),
    (
      select count(distinct m.equipo_id)
      from public.mantenimientos m
      join public.equipos e
        on e.id = m.equipo_id and e.situacion = 'activo'
      where m.proxima_revision is not null
        and m.proxima_revision <= current_date
        and m.estado <> 'completado'
    ),
    (
      select count(*)
      from public.mantenimientos m
      join public.equipos e
        on e.id = m.equipo_id and e.situacion = 'activo'
      where m.fecha_mantenimiento >= date_trunc('month', current_date)::date
        and m.fecha_mantenimiento <= current_date
    );
end;
$$;

revoke all on function public.indicadores_mantenimiento()
  from public, anon, authenticated;
grant execute on function public.indicadores_mantenimiento()
  to authenticated;

-- E. Equipos con la revisión vencida (mantenimientos pendientes con fecha vencida)
create or replace function public.equipos_revision_vencida()
returns table (equipo_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not private.tiene_rol(array['admin', 'tecnico']) then
    raise exception 'No tienes permiso para consultar las revisiones vencidas.';
  end if;

  return query
  select distinct m.equipo_id
  from public.mantenimientos m
  join public.equipos e
    on e.id = m.equipo_id and e.situacion = 'activo'
  where m.proxima_revision is not null
    and m.proxima_revision <= current_date
    and m.estado <> 'completado';
end;
$$;

revoke all on function public.equipos_revision_vencida()
  from public, anon, authenticated;
grant execute on function public.equipos_revision_vencida()
  to authenticated;

-- F. Auditoría reproducible de las tablas operativas ---------------------------
-- La documentación declaraba estos disparadores, pero el repositorio no los
-- creaba. Se recrean de forma idempotente para que cualquier entorno nuevo
-- conserve la misma trazabilidad.
do $$
declare
  t text;
begin
  foreach t in array array[
    'equipos', 'mantenimientos', 'componentes', 'relaciones_equipos', 'movimientos'
  ]
  loop
    execute format('drop trigger if exists auditoria_%1$s on public.%1$I', t);
    execute format(
      'create trigger auditoria_%1$s
         after insert or update or delete on public.%1$I
         for each row execute function private.registrar_auditoria()',
      t
    );
  end loop;
end
$$;

-- G. Las escrituras de mantenimientos pasan solo por las funciones ------------
-- Evita que un cliente autenticado modifique directamente el estado o el
-- responsable sin pasar por las validaciones y sin registrar la transición.
revoke insert, update, delete on public.mantenimientos
  from anon, authenticated;

notify pgrst, 'reload schema';

commit;
