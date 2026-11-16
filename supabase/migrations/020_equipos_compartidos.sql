-- Solo crea estructura. No modifica equipos, ubicaciones ni movimientos existentes.
begin;
create table if not exists public.equipo_areas_usuarias (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  ambiente_id uuid not null references public.ambientes(id),
  creado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (equipo_id, ambiente_id)
);
create index if not exists equipo_areas_usuarias_ambiente_idx on public.equipo_areas_usuarias(ambiente_id);
alter table public.equipo_areas_usuarias enable row level security;
revoke all on public.equipo_areas_usuarias from public, anon, authenticated;
grant select on public.equipo_areas_usuarias to authenticated;
drop policy if exists equipo_areas_usuarias_leer on public.equipo_areas_usuarias;
create policy equipo_areas_usuarias_leer on public.equipo_areas_usuarias for select to authenticated
  using ((select private.tiene_rol(array['admin','tecnico','consulta']))
    and exists (select 1 from public.equipos e where e.id = equipo_id));
drop trigger if exists auditoria_equipo_areas_usuarias on public.equipo_areas_usuarias;
create trigger auditoria_equipo_areas_usuarias after insert or delete on public.equipo_areas_usuarias
  for each row execute function private.registrar_auditoria();

create or replace function public.configurar_areas_equipo(
  p_equipo_id uuid, p_areas uuid[], p_areas_anteriores uuid[]
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_areas uuid[];
  v_anteriores uuid[];
  v_actuales uuid[];
  v_situacion text;
begin
  if auth.uid() is null or not coalesce(private.tiene_rol(array['admin','tecnico']), false) then
    raise exception 'No tienes permiso para configurar áreas usuarias.' using errcode = '42501';
  end if;
  if p_areas is null or p_areas_anteriores is null or cardinality(p_areas) > 100
    or array_position(p_areas, null) is not null then
    raise exception 'La lista de áreas no es válida.';
  end if;
  select e.situacion into v_situacion from public.equipos e
    where e.id = p_equipo_id and e.deleted_at is null for update;
  if not found or v_situacion <> 'activo' then
    raise exception 'Solo se puede configurar el uso de equipos activos.';
  end if;
  select coalesce(array_agg(distinct a order by a), '{}'::uuid[]) into v_areas from unnest(p_areas) a;
  select coalesce(array_agg(distinct a order by a), '{}'::uuid[]) into v_anteriores from unnest(p_areas_anteriores) a;
  select coalesce(array_agg(ambiente_id order by ambiente_id), '{}'::uuid[]) into v_actuales
    from public.equipo_areas_usuarias where equipo_id = p_equipo_id;
  if v_actuales is distinct from v_anteriores then
    raise exception 'Otra persona cambió las áreas usuarias. Recarga antes de guardar.' using errcode = '40001';
  end if;
  if exists (
    select 1 from unnest(v_areas) area_id
    left join public.ambientes a on a.id = area_id
    left join public.pisos pi on pi.id = a.piso_id
    left join public.pabellones p on p.id = pi.pabellon_id
    where a.id is null or
      (not (area_id = any(v_actuales)) and
        (not a.activo or not (coalesce(a.tipo,'') = 'oficina' or lower(btrim(coalesce(p.nombre,''))) = 'areas')))
  ) then raise exception 'Selecciona oficinas o áreas activas y válidas.'; end if;
  delete from public.equipo_areas_usuarias where equipo_id = p_equipo_id and not (ambiente_id = any(v_areas));
  insert into public.equipo_areas_usuarias(equipo_id, ambiente_id, creado_por)
    select p_equipo_id, a, auth.uid() from unnest(v_areas) a
    where not (a = any(v_actuales));
end;
$$;
revoke all on function public.configurar_areas_equipo(uuid,uuid[],uuid[]) from public, anon;
grant execute on function public.configurar_areas_equipo(uuid,uuid[],uuid[]) to authenticated;
commit;
