begin;

-- A. Ubicaciones y categorías: solo el administrador escribe -----------------
drop policy if exists pabellones_insertar on public.pabellones;
drop policy if exists pabellones_actualizar on public.pabellones;
create policy pabellones_insertar on public.pabellones
  for insert to authenticated
  with check ((select private.tiene_rol(array['admin'])));
create policy pabellones_actualizar on public.pabellones
  for update to authenticated
  using ((select private.tiene_rol(array['admin'])))
  with check ((select private.tiene_rol(array['admin'])));

drop policy if exists pisos_insertar on public.pisos;
drop policy if exists pisos_actualizar on public.pisos;
create policy pisos_insertar on public.pisos
  for insert to authenticated
  with check ((select private.tiene_rol(array['admin'])));
create policy pisos_actualizar on public.pisos
  for update to authenticated
  using ((select private.tiene_rol(array['admin'])))
  with check ((select private.tiene_rol(array['admin'])));

drop policy if exists ambientes_insertar on public.ambientes;
drop policy if exists ambientes_actualizar on public.ambientes;
create policy ambientes_insertar on public.ambientes
  for insert to authenticated
  with check ((select private.tiene_rol(array['admin'])));
create policy ambientes_actualizar on public.ambientes
  for update to authenticated
  using ((select private.tiene_rol(array['admin'])))
  with check ((select private.tiene_rol(array['admin'])));

drop policy if exists categorias_insertar on public.categorias_equipos;
drop policy if exists categorias_actualizar on public.categorias_equipos;
create policy categorias_insertar on public.categorias_equipos
  for insert to authenticated
  with check ((select private.tiene_rol(array['admin'])));
create policy categorias_actualizar on public.categorias_equipos
  for update to authenticated
  using ((select private.tiene_rol(array['admin'])))
  with check ((select private.tiene_rol(array['admin'])));

-- B. Consulta no lee mantenimientos ni movimientos -----------------------------
drop policy if exists mantenimientos_leer on public.mantenimientos;
create policy mantenimientos_leer on public.mantenimientos
  for select to authenticated
  using ((select private.tiene_rol(array['admin', 'tecnico'])));

drop policy if exists movimientos_leer on public.movimientos;
create policy movimientos_leer on public.movimientos
  for select to authenticated
  using ((select private.tiene_rol(array['admin', 'tecnico'])));

-- C. Equipos: el técnico solo trabaja con equipos activos; la baja es del admin
drop policy if exists equipos_insertar on public.equipos;
create policy equipos_insertar on public.equipos
  for insert to authenticated
  with check (
    (select private.tiene_rol(array['admin']))
    or ((select private.tiene_rol(array['tecnico']))
        and situacion = 'activo' and deleted_at is null)
  );

drop policy if exists equipos_actualizar on public.equipos;
create policy equipos_actualizar on public.equipos
  for update to authenticated
  using (
    (select private.tiene_rol(array['admin']))
    or ((select private.tiene_rol(array['tecnico']))
        and situacion = 'activo' and deleted_at is null)
  )
  with check (
    (select private.tiene_rol(array['admin']))
    or ((select private.tiene_rol(array['tecnico']))
        and situacion = 'activo' and deleted_at is null)
  );

-- D. Perfiles: el admin solo actualiza (sin insertar ni borrar desde la app) ---
drop policy if exists profiles_admin_gestionar on public.profiles;
create policy profiles_admin_actualizar on public.profiles
  for update to authenticated
  using ((select private.tiene_rol(array['admin'])))
  with check ((select private.tiene_rol(array['admin'])));

create or replace function private.proteger_profiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id <> old.id then
    raise exception 'No se puede cambiar el identificador de un perfil.';
  end if;

  -- auth.uid() es null al ejecutar desde el SQL Editor: ahí se permite todo.
  if auth.uid() is not null
     and old.id = auth.uid()
     and (new.rol <> old.rol or new.activo <> old.activo) then
    raise exception 'No puedes cambiar tu propio rol ni tu propio estado.';
  end if;

  if old.rol = 'admin' and old.activo
     and (new.rol <> 'admin' or not new.activo) then
    if not exists (
      select 1 from public.profiles
      where rol = 'admin' and activo and id <> old.id
    ) then
      raise exception 'Debe existir al menos un administrador activo.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists proteger_profiles on public.profiles;
create trigger proteger_profiles
  before update on public.profiles
  for each row execute function private.proteger_profiles();

-- E. updated_at automático ------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.equipos;
create trigger set_updated_at
  before update on public.equipos
  for each row execute function private.set_updated_at();

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

commit;
