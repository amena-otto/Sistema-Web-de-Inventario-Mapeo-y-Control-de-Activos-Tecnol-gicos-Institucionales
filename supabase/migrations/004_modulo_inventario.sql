begin;

alter table public.equipos
  add column if not exists codigo_patrimonial text,
  add column if not exists posicion text,
  add column if not exists responsable_id uuid references public.profiles(id),
  add column if not exists fecha_garantia date;

create sequence if not exists public.equipos_codigo_institucional_seq;

create or replace function public.generar_codigo_equipo()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_numero bigint := nextval('public.equipos_codigo_institucional_seq');
  v_texto text;
begin
  loop
    v_texto := 'OT-EQP-' ||
      lpad(v_numero::text, greatest(6, length(v_numero::text)), '0');
    exit when not exists (
      select 1 from public.equipos where codigo_institucional = v_texto
    );
    v_numero := nextval('public.equipos_codigo_institucional_seq');
  end loop;
  return v_texto;
end;
$$;

revoke all on function public.generar_codigo_equipo() from public, anon;
revoke all on function public.generar_codigo_equipo() from authenticated;

create or replace function private.asignar_codigo_equipo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.codigo_institucional := public.generar_codigo_equipo();
  return new;
end;
$$;

revoke all on function private.asignar_codigo_equipo() from public, anon, authenticated;

drop trigger if exists asignar_codigo_equipo on public.equipos;
create trigger asignar_codigo_equipo
  before insert on public.equipos
  for each row execute function private.asignar_codigo_equipo();

do $$
declare
  v_siguiente bigint;
begin
  select coalesce(
    max(substring(codigo_institucional from '^OT-EQP-([0-9]+)$')::bigint),
    0
  ) + 1
  into v_siguiente
  from public.equipos;

  perform setval(
    'public.equipos_codigo_institucional_seq',
    v_siguiente,
    false
  );
end;
$$;

alter table public.equipos
  alter column codigo_institucional drop default;

revoke all on sequence public.equipos_codigo_institucional_seq from public, anon, authenticated;

alter table public.equipos
  drop constraint if exists equipos_estado_operativo_check;

alter table public.equipos
  add constraint equipos_estado_operativo_check
  check (
    estado_operativo = any (
      array[
        'operativo',
        'con_fallas',
        'en_mantenimiento',
        'inoperativo',
        'en_almacen'
      ]
    )
  );

create index if not exists equipos_numero_serie_idx
  on public.equipos (lower(numero_serie))
  where numero_serie is not null;

create index if not exists equipos_codigo_patrimonial_idx
  on public.equipos (lower(codigo_patrimonial))
  where codigo_patrimonial is not null;

alter table public.componentes enable row level security;
alter table public.relaciones_equipos enable row level security;
alter table public.fotografias_equipos enable row level security;

drop policy if exists inventario_componentes_leer on public.componentes;
create policy inventario_componentes_leer
  on public.componentes for select to authenticated
  using ((select private.tiene_rol(array['admin', 'tecnico', 'consulta'])));

drop policy if exists inventario_componentes_limitar_lectura on public.componentes;
create policy inventario_componentes_limitar_lectura
  on public.componentes as restrictive for select to authenticated
  using ((select private.tiene_rol(array['admin', 'tecnico', 'consulta'])));

drop policy if exists inventario_componentes_insertar on public.componentes;
create policy inventario_componentes_insertar
  on public.componentes for insert to authenticated
  with check ((select private.tiene_rol(array['admin', 'tecnico'])));

drop policy if exists inventario_componentes_limitar_insercion on public.componentes;
create policy inventario_componentes_limitar_insercion
  on public.componentes as restrictive for insert to authenticated
  with check ((select private.tiene_rol(array['admin', 'tecnico'])));

drop policy if exists inventario_componentes_actualizar on public.componentes;
create policy inventario_componentes_actualizar
  on public.componentes for update to authenticated
  using ((select private.tiene_rol(array['admin', 'tecnico'])))
  with check ((select private.tiene_rol(array['admin', 'tecnico'])));

drop policy if exists inventario_componentes_limitar_actualizacion on public.componentes;
create policy inventario_componentes_limitar_actualizacion
  on public.componentes as restrictive for update to authenticated
  using ((select private.tiene_rol(array['admin', 'tecnico'])))
  with check ((select private.tiene_rol(array['admin', 'tecnico'])));

drop policy if exists inventario_relaciones_leer on public.relaciones_equipos;
create policy inventario_relaciones_leer
  on public.relaciones_equipos for select to authenticated
  using ((select private.tiene_rol(array['admin', 'tecnico', 'consulta'])));

drop policy if exists inventario_relaciones_limitar_lectura on public.relaciones_equipos;
create policy inventario_relaciones_limitar_lectura
  on public.relaciones_equipos as restrictive for select to authenticated
  using ((select private.tiene_rol(array['admin', 'tecnico', 'consulta'])));

drop policy if exists inventario_relaciones_insertar on public.relaciones_equipos;
create policy inventario_relaciones_insertar
  on public.relaciones_equipos for insert to authenticated
  with check ((select private.tiene_rol(array['admin', 'tecnico'])));

drop policy if exists inventario_relaciones_limitar_insercion on public.relaciones_equipos;
create policy inventario_relaciones_limitar_insercion
  on public.relaciones_equipos as restrictive for insert to authenticated
  with check ((select private.tiene_rol(array['admin', 'tecnico'])));

drop policy if exists inventario_fotografias_leer on public.fotografias_equipos;
create policy inventario_fotografias_leer
  on public.fotografias_equipos for select to authenticated
  using ((select private.tiene_rol(array['admin', 'tecnico', 'consulta'])));

drop policy if exists inventario_fotografias_limitar_lectura on public.fotografias_equipos;
create policy inventario_fotografias_limitar_lectura
  on public.fotografias_equipos as restrictive for select to authenticated
  using ((select private.tiene_rol(array['admin', 'tecnico', 'consulta'])));

drop policy if exists inventario_fotografias_insertar on public.fotografias_equipos;
create policy inventario_fotografias_insertar
  on public.fotografias_equipos for insert to authenticated
  with check ((select private.tiene_rol(array['admin', 'tecnico'])));

drop policy if exists inventario_fotografias_limitar_insercion on public.fotografias_equipos;
create policy inventario_fotografias_limitar_insercion
  on public.fotografias_equipos as restrictive for insert to authenticated
  with check ((select private.tiene_rol(array['admin', 'tecnico'])));

commit;
