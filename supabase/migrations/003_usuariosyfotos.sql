begin;

-- A. Perfil automático: toda cuenta nueva de Auth nace como Consulta e INACTIVA.
--    El rol nunca se toma de los metadatos del usuario.
create or replace function private.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nombres, apellidos, rol, activo)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombres'), ''), 'Pendiente'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'apellidos'), ''), 'Pendiente'),
    'consulta',
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function private.crear_perfil_nuevo_usuario() from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.crear_perfil_nuevo_usuario() to supabase_auth_admin;

drop trigger if exists crear_perfil_nuevo_usuario on auth.users;
create trigger crear_perfil_nuevo_usuario
  after insert on auth.users
  for each row execute function private.crear_perfil_nuevo_usuario();

-- B. Bucket privado de fotografías (2 MB por archivo, solo imágenes)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fotografias-equipos', 'fotografias-equipos', false, 2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Leer: cualquier rol activo. Subir: admin o técnico, solo en equipos/{id_de_equipo_existente}/...
-- Sin políticas de UPDATE ni DELETE: las fotografías no se reemplazan ni se borran desde la app.
drop policy if exists fotos_equipos_leer on storage.objects;
create policy fotos_equipos_leer on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fotografias-equipos'
    and (select private.tiene_rol(array['admin', 'tecnico', 'consulta']))
  );

drop policy if exists fotos_equipos_subir on storage.objects;
create policy fotos_equipos_subir on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotografias-equipos'
    and (select private.tiene_rol(array['admin', 'tecnico']))
    and (storage.foldername(name))[1] = 'equipos'
    and exists (
      select 1 from public.equipos e
      where e.id::text = (storage.foldername(name))[2]
    )
  );

-- C. Cierre de permisos: sin acceso anónimo y sin DELETE desde la API
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
revoke delete on all tables in schema public from authenticated;
alter default privileges in schema public revoke delete on tables from authenticated;

commit;