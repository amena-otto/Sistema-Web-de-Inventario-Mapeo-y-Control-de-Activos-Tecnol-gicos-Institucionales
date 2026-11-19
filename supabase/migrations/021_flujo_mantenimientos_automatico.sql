begin;

-- 1. Campos nuevos del ciclo automático ---------------------------------------
-- fecha_mantenimiento se conserva como fecha programada; proxima_revision sigue
-- siendo la revisión preventiva posterior al cierre. Los campos nuevos son
-- anulables para no inventar fechas ni estados de intervenciones históricas.
alter table public.mantenimientos
  add column if not exists estado_operativo_anterior text,
  add column if not exists fecha_inicio_real timestamptz,
  add column if not exists fecha_finalizacion_real timestamptz,
  add column if not exists iniciado_por uuid,
  add column if not exists finalizado_por uuid,
  add column if not exists proximo_seguimiento timestamptz;

comment on column public.mantenimientos.fecha_mantenimiento is
  'Fecha programada de la intervención. No es la fecha real de inicio ni de cierre.';
comment on column public.mantenimientos.estado_operativo_anterior is
  'Estado operativo del equipo inmediatamente antes de iniciar la intervención.';
comment on column public.mantenimientos.proximo_seguimiento is
  'Seguimiento de una intervención en_proceso. No sustituye a proxima_revision.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mantenimientos_estado_operativo_anterior_check'
  ) then
    alter table public.mantenimientos
      add constraint mantenimientos_estado_operativo_anterior_check
      check (
        estado_operativo_anterior is null
        or estado_operativo_anterior in (
          'operativo', 'con_fallas', 'en_mantenimiento', 'inoperativo', 'en_almacen'
        )
      )
      not valid;
  end if;
end
$$;

-- 2. Avances cronológicos de una misma intervención ----------------------------
create table if not exists public.mantenimiento_avances (
  id uuid primary key default gen_random_uuid(),
  mantenimiento_id uuid not null
    references public.mantenimientos(id) on delete cascade,
  equipo_id uuid not null,
  fecha_hora timestamptz not null default now(),
  registrado_por uuid,
  descripcion text not null,
  observaciones text,
  diagnostico text,
  acciones_realizadas text,
  componentes_reemplazados text,
  proximo_seguimiento timestamptz,
  constraint mantenimiento_avances_descripcion_check
    check (length(btrim(descripcion)) > 0)
);

create index if not exists mantenimiento_avances_mantenimiento_fecha_idx
  on public.mantenimiento_avances (mantenimiento_id, fecha_hora);

alter table public.mantenimiento_avances enable row level security;

drop policy if exists mantenimiento_avances_leer
  on public.mantenimiento_avances;
create policy mantenimiento_avances_leer
  on public.mantenimiento_avances for select to authenticated
  using ((select coalesce(private.tiene_rol(array['admin', 'tecnico']), false)));

revoke all on public.mantenimiento_avances from public, anon, authenticated;
grant select on public.mantenimiento_avances to authenticated;

comment on table public.mantenimiento_avances is
  'Avances cronológicos e inmutables de una intervención en_proceso.';

create or replace function private.proteger_mantenimiento_avances()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Los avances de mantenimiento son inmutables; registra uno nuevo.';
end;
$$;

revoke all on function private.proteger_mantenimiento_avances()
  from public, anon, authenticated;

drop trigger if exists proteger_mantenimiento_avances
  on public.mantenimiento_avances;
create trigger proteger_mantenimiento_avances
  before update or delete on public.mantenimiento_avances
  for each row execute function private.proteger_mantenimiento_avances();

drop trigger if exists auditoria_mantenimiento_avances
  on public.mantenimiento_avances;
create trigger auditoria_mantenimiento_avances
  after insert on public.mantenimiento_avances
  for each row execute function private.registrar_auditoria();

-- 3. Normalización de búsqueda sin depender de extensiones ---------------------
create or replace function public.normalizar_busqueda_mantenimientos(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    translate(lower(coalesce(p_texto, '')), 'áéíóúüñ', 'aeiouun'),
    '\s+',
    ' ',
    'g'
  )
$$;

revoke all on function public.normalizar_busqueda_mantenimientos(text)
  from public, anon, authenticated;
grant execute on function public.normalizar_busqueda_mantenimientos(text)
  to authenticated;

-- 4. Búsqueda escrita de equipos para el formulario de registro ----------------
create or replace function public.buscar_equipos_mantenimiento(
  p_termino text default '',
  p_limite integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  codigo_institucional text,
  nombre text,
  numero_serie text,
  categoria_nombre text,
  ubicacion text,
  estado_operativo text,
  total integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_terminos text[] := array_remove(
    string_to_array(public.normalizar_busqueda_mantenimientos(p_termino), ' '),
    ''
  );
begin
  if auth.uid() is null
     or not coalesce(private.tiene_rol(array['admin', 'tecnico']), false) then
    raise exception 'No tienes permiso para buscar equipos para mantenimiento.';
  end if;

  return query
  select
    e.id,
    e.codigo_institucional,
    e.nombre,
    e.numero_serie,
    c.nombre as categoria_nombre,
    case
      when a.id is null then 'Sin ubicación'
      when a.tipo = 'oficina'
        or public.normalizar_busqueda_mantenimientos(pa.nombre) = 'areas'
        then 'Áreas académicas / ' || a.nombre
      else nullif(
        concat_ws(
          ' / ',
          pa.nombre,
          p.nombre,
          nullif(concat_ws(' — ', a.codigo, a.nombre), '')
        ),
        ''
      )
    end as ubicacion,
    e.estado_operativo,
    (count(*) over ())::integer as total
  from public.equipos e
  left join public.categorias_equipos c on c.id = e.categoria_id
  left join public.ambientes a on a.id = e.ambiente_id
  left join public.pisos p on p.id = a.piso_id
  left join public.pabellones pa on pa.id = p.pabellon_id
  where e.situacion = 'activo'
    and (
      cardinality(v_terminos) = 0
      or (
        select bool_and(
          public.normalizar_busqueda_mantenimientos(
            concat_ws(
              ' ',
              e.codigo_institucional,
              e.nombre,
              e.numero_serie,
              e.marca,
              e.modelo,
              e.codigo_patrimonial,
              c.nombre,
              a.nombre,
              a.codigo,
              p.nombre,
              pa.nombre
            )
          ) like '%' || termino || '%'
        )
        from unnest(v_terminos) as u(termino)
      )
    )
  order by e.codigo_institucional
  limit least(greatest(coalesce(p_limite, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.buscar_equipos_mantenimiento(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.buscar_equipos_mantenimiento(text, integer, integer)
  to authenticated;

-- 5. Un sola intervención en_proceso por equipo --------------------------------
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'mantenimientos_un_en_proceso_por_equipo_uidx'
  ) then
    if exists (
      select 1
      from public.mantenimientos
      where estado = 'en_proceso'
      group by equipo_id
      having count(*) > 1
    ) then
      raise notice 'Existen duplicados históricos en_proceso; no se crea el índice único. Se conservan sin modificar.';
    else
      execute 'create unique index mantenimientos_un_en_proceso_por_equipo_uidx
        on public.mantenimientos (equipo_id) where estado = ''en_proceso''';
    end if;
  end if;
end
$$;

create or replace function private.validar_mantenimiento_en_proceso_unico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bloqueante uuid;
begin
  if new.estado is distinct from 'en_proceso' then
    return new;
  end if;

  if tg_op = 'update'
     and old.estado = 'en_proceso'
     and old.equipo_id is not distinct from new.equipo_id then
    return new;
  end if;

  select m.id into v_bloqueante
  from public.mantenimientos m
  where m.equipo_id = new.equipo_id
    and m.estado = 'en_proceso'
    and m.id is distinct from new.id
  limit 1;

  if found then
    raise exception 'El equipo ya tiene una intervención en_proceso: %.', v_bloqueante
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validar_mantenimiento_en_proceso_unico()
  from public, anon, authenticated;

drop trigger if exists validar_mantenimiento_en_proceso_unico
  on public.mantenimientos;
create trigger validar_mantenimiento_en_proceso_unico
  before insert or update of estado, equipo_id on public.mantenimientos
  for each row execute function private.validar_mantenimiento_en_proceso_unico();

-- 6. Protección diferida del estado operativo mientras hay intervención abierta --
create or replace function private.validar_estado_operativo_durante_mantenimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.estado_operativo is not distinct from new.estado_operativo then
    return null;
  end if;

  -- Las operaciones de servicio (por ejemplo, la baja definitiva) conservan su
  -- comportamiento actual.
  if auth.uid() is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.mantenimientos m
    where m.equipo_id = old.id
      and m.estado = 'en_proceso'
  ) then
    return null;
  end if;

  if not exists (
    select 1
    from public.mantenimiento_cambios_estado c
    where c.equipo_id = old.id
      and c.estado_equipo_anterior is not distinct from old.estado_operativo
      and c.estado_equipo_nuevo is not distinct from new.estado_operativo
      and c.usuario_id = auth.uid()
      and c.created_at >= transaction_timestamp()
  ) then
    raise exception 'El equipo tiene un mantenimiento en_proceso; usa Iniciar o Finalizar para cambiar su estado operativo.';
  end if;

  return null;
end;
$$;

revoke all on function private.validar_estado_operativo_durante_mantenimiento()
  from public, anon, authenticated;

drop trigger if exists validar_estado_operativo_durante_mantenimiento
  on public.equipos;
create constraint trigger validar_estado_operativo_durante_mantenimiento
  after update of estado_operativo on public.equipos
  deferrable initially deferred
  for each row execute function private.validar_estado_operativo_durante_mantenimiento();

-- 7. Alta: siempre pendiente, sin cambiar el estado operativo ------------------
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
  v_estado_equipo text;
begin
  if v_usuario is null
     or not coalesce(private.tiene_rol(array['admin', 'tecnico']), false) then
    raise exception 'Solo un administrador o técnico activo puede registrar mantenimientos.';
  end if;

  if p_estado is distinct from 'pendiente' then
    raise exception 'El mantenimiento se registra siempre como pendiente; use Iniciar y Finalizar para avanzar el ciclo.';
  end if;

  if p_tipo is null or p_tipo not in ('preventivo', 'correctivo') then
    raise exception 'El tipo de mantenimiento no es válido.';
  end if;

  if p_fecha_mantenimiento is null
     or p_problema_reportado is null
     or length(btrim(p_problema_reportado)) = 0 then
    raise exception 'La fecha programada y el problema reportado son obligatorios.';
  end if;

  if p_proxima_revision is not null
     and p_proxima_revision < p_fecha_mantenimiento then
    raise exception 'La próxima revisión no puede ser anterior a la fecha programada.';
  end if;

  v_responsable := coalesce(p_responsable_id, v_usuario);
  if p_responsable_id is not null
     and p_responsable_id <> v_usuario
     and not coalesce(private.tiene_rol(array['admin']), false) then
    raise exception 'Solo un administrador puede asignar la intervención a otro técnico.';
  end if;

  perform 1
  from public.profiles pr
  where pr.id = v_responsable
    and pr.activo
    and pr.rol in ('admin', 'tecnico');
  if not found then
    raise exception 'El técnico responsable no existe o no está activo.';
  end if;

  select e.estado_operativo into v_estado_equipo
  from public.equipos e
  where e.id = p_equipo_id and e.situacion = 'activo'
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
    'pendiente',
    v_responsable
  )
  returning id into v_mantenimiento_id;

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
    'pendiente',
    v_estado_equipo,
    v_estado_equipo,
    'Alta de la intervención',
    v_usuario
  );

  return v_mantenimiento_id;
end;
$$;

-- 8. Edición ordinaria: sin transiciones ni cambio manual del equipo -----------
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
  v_estado text;
  v_fecha date;
  v_responsable_actual uuid;
  v_responsable_nuevo uuid;
begin
  if v_usuario is null
     or not coalesce(private.tiene_rol(array['admin', 'tecnico']), false) then
    raise exception 'Solo un administrador o técnico activo puede actualizar mantenimientos.';
  end if;

  select m.equipo_id, m.estado, m.fecha_mantenimiento, m.responsable_id
  into v_equipo_id, v_estado, v_fecha, v_responsable_actual
  from public.mantenimientos m
  where m.id = p_id
  for update;
  if not found then
    raise exception 'La intervención no existe.';
  end if;

  if not coalesce(private.tiene_rol(array['admin']), false)
     and v_responsable_actual is distinct from v_usuario then
    raise exception 'Solo el técnico responsable o un administrador puede actualizar esta intervención.';
  end if;

  if v_estado = 'completado'
     and not coalesce(private.tiene_rol(array['admin']), false) then
    raise exception 'Solo un administrador puede editar una intervención completada.';
  end if;

  if p_estado is distinct from v_estado then
    raise exception 'Use Iniciar mantenimiento o Finalizar mantenimiento para cambiar el estado de la intervención.';
  end if;

  if p_problema_reportado is null
     or length(btrim(p_problema_reportado)) = 0 then
    raise exception 'El problema reportado es obligatorio.';
  end if;

  if p_proxima_revision is not null
     and p_proxima_revision < v_fecha then
    raise exception 'La próxima revisión no puede ser anterior a la fecha programada.';
  end if;

  v_responsable_nuevo := coalesce(p_responsable_id, v_responsable_actual, v_usuario);
  if p_responsable_id is not null
     and p_responsable_id <> coalesce(v_responsable_actual, v_usuario)
     and not coalesce(private.tiene_rol(array['admin']), false) then
    raise exception 'Solo un administrador puede reasignar la intervención.';
  end if;

  if v_responsable_nuevo is distinct from v_responsable_actual then
    perform 1
    from public.profiles pr
    where pr.id = v_responsable_nuevo
      and pr.activo
      and pr.rol in ('admin', 'tecnico');
    if not found then
      raise exception 'El técnico responsable no existe o no está activo.';
    end if;
  end if;

  update public.mantenimientos
  set
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

  return p_id;
end;
$$;

-- 9. Iniciar: estado operativo automático y fecha real de inicio ---------------
create or replace function public.iniciar_mantenimiento(
  p_mantenimiento_id uuid,
  p_observaciones text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_equipo_id uuid;
  v_estado text;
  v_responsable uuid;
  v_estado_equipo_anterior text;
  v_bloqueante uuid;
begin
  if v_usuario is null
     or not coalesce(private.tiene_rol(array['admin', 'tecnico']), false) then
    raise exception 'Solo un administrador o técnico activo puede iniciar mantenimientos.';
  end if;

  select m.equipo_id, m.estado, m.responsable_id
  into v_equipo_id, v_estado, v_responsable
  from public.mantenimientos m
  where m.id = p_mantenimiento_id
  for update;
  if not found then
    raise exception 'La intervención no existe.';
  end if;

  if not coalesce(private.tiene_rol(array['admin']), false)
     and v_responsable is distinct from v_usuario then
    raise exception 'Solo el técnico responsable o un administrador puede iniciar esta intervención.';
  end if;

  if v_estado is distinct from 'pendiente' then
    raise exception 'Solo se puede iniciar una intervención pendiente.';
  end if;

  select m.id into v_bloqueante
  from public.mantenimientos m
  where m.equipo_id = v_equipo_id
    and m.estado = 'en_proceso'
    and m.id is distinct from p_mantenimiento_id
  limit 1;
  if found then
    raise exception 'El equipo ya tiene una intervención en_proceso: %. Consulta su historial antes de iniciar otra.', v_bloqueante;
  end if;

  select e.estado_operativo into v_estado_equipo_anterior
  from public.equipos e
  where e.id = v_equipo_id and e.situacion = 'activo'
  for update;
  if not found then
    raise exception 'El equipo no existe o está dado de baja.';
  end if;

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
    p_mantenimiento_id,
    v_equipo_id,
    'pendiente',
    'en_proceso',
    v_estado_equipo_anterior,
    'en_mantenimiento',
    'Inicio de la intervención',
    v_usuario
  );

  update public.mantenimientos
  set
    estado = 'en_proceso',
    fecha_inicio_real = now(),
    iniciado_por = v_usuario,
    estado_operativo_anterior = v_estado_equipo_anterior,
    observaciones = case
      when nullif(btrim(p_observaciones), '') is null then observaciones
      else concat_ws(E'\n', observaciones, 'Inicio: ' || btrim(p_observaciones))
    end
  where id = p_mantenimiento_id;

  update public.equipos
  set estado_operativo = 'en_mantenimiento'
  where id = v_equipo_id;

  return p_mantenimiento_id;
end;
$$;

-- 10. Guardar avance: misma intervención, historial inmutable ------------------
create or replace function public.guardar_avance_mantenimiento(
  p_mantenimiento_id uuid,
  p_descripcion text,
  p_observaciones text default null,
  p_diagnostico text default null,
  p_acciones text default null,
  p_componentes text default null,
  p_proximo_seguimiento timestamptz default null,
  p_actualizar_seguimiento boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_equipo_id uuid;
  v_estado text;
  v_responsable uuid;
  v_avance_id uuid;
begin
  if v_usuario is null
     or not coalesce(private.tiene_rol(array['admin', 'tecnico']), false) then
    raise exception 'Solo un administrador o técnico activo puede registrar avances.';
  end if;

  if p_descripcion is null or length(btrim(p_descripcion)) = 0 then
    raise exception 'Describe el avance registrado.';
  end if;

  select m.equipo_id, m.estado, m.responsable_id
  into v_equipo_id, v_estado, v_responsable
  from public.mantenimientos m
  where m.id = p_mantenimiento_id
  for update;
  if not found then
    raise exception 'La intervención no existe.';
  end if;

  if not coalesce(private.tiene_rol(array['admin']), false)
     and v_responsable is distinct from v_usuario then
    raise exception 'Solo el técnico responsable o un administrador puede registrar avances.';
  end if;

  if v_estado is distinct from 'en_proceso' then
    raise exception 'Solo se pueden registrar avances en intervenciones en_proceso.';
  end if;

  perform 1 from public.equipos e where e.id = v_equipo_id for update;
  if not found then
    raise exception 'El equipo no existe.';
  end if;

  insert into public.mantenimiento_avances (
    mantenimiento_id,
    equipo_id,
    registrado_por,
    descripcion,
    observaciones,
    diagnostico,
    acciones_realizadas,
    componentes_reemplazados,
    proximo_seguimiento
  )
  values (
    p_mantenimiento_id,
    v_equipo_id,
    v_usuario,
    btrim(p_descripcion),
    nullif(btrim(p_observaciones), ''),
    nullif(btrim(p_diagnostico), ''),
    nullif(btrim(p_acciones), ''),
    nullif(btrim(p_componentes), ''),
    case when p_actualizar_seguimiento then p_proximo_seguimiento else null end
  )
  returning id into v_avance_id;

  update public.mantenimientos
  set
    diagnostico = coalesce(nullif(btrim(p_diagnostico), ''), diagnostico),
    acciones_realizadas = coalesce(nullif(btrim(p_acciones), ''), acciones_realizadas),
    componentes_reemplazados = coalesce(
      nullif(btrim(p_componentes), ''), componentes_reemplazados
    ),
    observaciones = case
      when nullif(btrim(p_observaciones), '') is null then observaciones
      else concat_ws(E'\n', observaciones, btrim(p_observaciones))
    end,
    proximo_seguimiento = case
      when p_actualizar_seguimiento then p_proximo_seguimiento
      else proximo_seguimiento
    end
  where id = p_mantenimiento_id;

  return v_avance_id;
end;
$$;

-- 11. Finalizar: cierre obligatorio y estado operativo elegido explícitamente --
create or replace function public.finalizar_mantenimiento(
  p_mantenimiento_id uuid,
  p_diagnostico text,
  p_acciones text,
  p_resultado text,
  p_estado_operativo_final text,
  p_componentes text default null,
  p_observaciones_finales text default null,
  p_proxima_revision date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_equipo_id uuid;
  v_estado text;
  v_responsable uuid;
  v_fecha_programada date;
  v_estado_equipo_anterior text;
begin
  if v_usuario is null
     or not coalesce(private.tiene_rol(array['admin', 'tecnico']), false) then
    raise exception 'Solo un administrador o técnico activo puede finalizar mantenimientos.';
  end if;

  if p_diagnostico is null or length(btrim(p_diagnostico)) = 0
     or p_acciones is null or length(btrim(p_acciones)) = 0
     or p_resultado is null or length(btrim(p_resultado)) = 0 then
    raise exception 'Para finalizar debes registrar diagnóstico, acciones realizadas y resultado.';
  end if;

  if p_estado_operativo_final is null
     or p_estado_operativo_final not in ('operativo', 'con_fallas', 'inoperativo') then
    raise exception 'Selecciona un estado operativo final válido: operativo, con_fallas o inoperativo.';
  end if;

  select m.equipo_id, m.estado, m.responsable_id, m.fecha_mantenimiento
  into v_equipo_id, v_estado, v_responsable, v_fecha_programada
  from public.mantenimientos m
  where m.id = p_mantenimiento_id
  for update;
  if not found then
    raise exception 'La intervención no existe.';
  end if;

  if not coalesce(private.tiene_rol(array['admin']), false)
     and v_responsable is distinct from v_usuario then
    raise exception 'Solo el técnico responsable o un administrador puede finalizar esta intervención.';
  end if;

  if v_estado is distinct from 'en_proceso' then
    raise exception 'Solo se puede finalizar una intervención en_proceso.';
  end if;

  if p_proxima_revision is not null
     and p_proxima_revision < v_fecha_programada then
    raise exception 'La próxima revisión preventiva no puede ser anterior a la fecha programada.';
  end if;

  select e.estado_operativo into v_estado_equipo_anterior
  from public.equipos e
  where e.id = v_equipo_id and e.situacion = 'activo'
  for update;
  if not found then
    raise exception 'El equipo no existe o está dado de baja.';
  end if;

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
    p_mantenimiento_id,
    v_equipo_id,
    'en_proceso',
    'completado',
    v_estado_equipo_anterior,
    p_estado_operativo_final,
    btrim(p_resultado),
    v_usuario
  );

  update public.mantenimientos
  set
    estado = 'completado',
    diagnostico = btrim(p_diagnostico),
    acciones_realizadas = btrim(p_acciones),
    componentes_reemplazados = nullif(btrim(p_componentes), ''),
    resultado = btrim(p_resultado),
    observaciones = case
      when nullif(btrim(p_observaciones_finales), '') is null then observaciones
      else concat_ws(E'\n', observaciones, 'Cierre: ' || btrim(p_observaciones_finales))
    end,
    proxima_revision = p_proxima_revision,
    proximo_seguimiento = null,
    fecha_finalizacion_real = now(),
    finalizado_por = v_usuario
  where id = p_mantenimiento_id;

  update public.equipos
  set estado_operativo = p_estado_operativo_final
  where id = v_equipo_id;

  return p_mantenimiento_id;
end;
$$;

-- 11.1 Excepción administrativa explícita y auditada ---------------------------
-- Solo para corregir, con motivo, el estado operativo de un equipo durante una
-- intervención abierta. La fila de cambios habilita el disparador diferido y
-- deja constancia del usuario, la fecha y la justificación.
create or replace function public.corregir_estado_operativo_en_mantenimiento(
  p_equipo_id uuid,
  p_estado_operativo text,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_mantenimiento_id uuid;
  v_estado_anterior text;
begin
  if v_usuario is null
     or not coalesce(private.tiene_rol(array['admin']), false) then
    raise exception 'Solo un administrador puede aplicar esta corrección.';
  end if;

  if p_estado_operativo is null
     or p_estado_operativo not in (
       'operativo', 'con_fallas', 'en_mantenimiento', 'inoperativo', 'en_almacen'
     ) then
    raise exception 'El estado operativo indicado no es válido.';
  end if;

  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'La corrección administrativa requiere un motivo.';
  end if;

  select m.id into v_mantenimiento_id
  from public.mantenimientos m
  where m.equipo_id = p_equipo_id
    and m.estado = 'en_proceso'
  order by m.created_at desc
  limit 1;
  if not found then
    raise exception 'El equipo no tiene una intervención en_proceso; usa el formulario ordinario de equipos.';
  end if;

  select e.estado_operativo into v_estado_anterior
  from public.equipos e
  where e.id = p_equipo_id and e.situacion = 'activo'
  for update;
  if not found then
    raise exception 'El equipo no existe o está dado de baja.';
  end if;

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
    'en_proceso',
    'en_proceso',
    v_estado_anterior,
    p_estado_operativo,
    'Corrección administrativa: ' || btrim(p_motivo),
    v_usuario
  );

  update public.equipos
  set estado_operativo = p_estado_operativo
  where id = p_equipo_id;
end;
$$;

-- 12. Permisos y recarga del esquema ------------------------------------------
revoke all on function public.registrar_mantenimiento(
  uuid, text, date, text, text, text, text, text, text, date, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.registrar_mantenimiento(
  uuid, text, date, text, text, text, text, text, text, date, text, text, uuid, text
) to authenticated;

revoke all on function public.actualizar_mantenimiento(
  uuid, text, text, text, text, text, text, text, date, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.actualizar_mantenimiento(
  uuid, text, text, text, text, text, text, text, date, text, text, uuid
) to authenticated;

revoke all on function public.iniciar_mantenimiento(uuid, text)
  from public, anon, authenticated;
grant execute on function public.iniciar_mantenimiento(uuid, text)
  to authenticated;

revoke all on function public.guardar_avance_mantenimiento(
  uuid, text, text, text, text, text, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function public.guardar_avance_mantenimiento(
  uuid, text, text, text, text, text, timestamptz, boolean
) to authenticated;

revoke all on function public.finalizar_mantenimiento(
  uuid, text, text, text, text, text, text, date
) from public, anon, authenticated;
grant execute on function public.finalizar_mantenimiento(
  uuid, text, text, text, text, text, text, date
) to authenticated;

revoke all on function public.corregir_estado_operativo_en_mantenimiento(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.corregir_estado_operativo_en_mantenimiento(uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
