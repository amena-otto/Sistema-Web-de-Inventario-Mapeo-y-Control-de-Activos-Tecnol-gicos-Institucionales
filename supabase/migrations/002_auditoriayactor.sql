begin;

-- A. Auditoría corregida: no depende de columnas que no existen en todas las tablas
create or replace function private.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_antes jsonb;
  v_despues jsonb;
  v_operacion text;
  v_usuario uuid;
begin
  if tg_op = 'DELETE' then
    v_antes := to_jsonb(old);
    v_id := old.id;
    v_operacion := 'DELETE';
  elsif tg_op = 'UPDATE' then
    v_antes := to_jsonb(old);
    v_despues := to_jsonb(new);
    v_id := new.id;

    if (v_despues ->> 'situacion') is distinct from (v_antes ->> 'situacion')
       and (v_despues ->> 'situacion') in ('baja', 'archivado') then
      v_operacion := 'ARCHIVE';
    else
      v_operacion := 'UPDATE';
    end if;
  else
    v_despues := to_jsonb(new);
    v_id := new.id;
    v_operacion := 'INSERT';
  end if;

  select p.id into v_usuario
  from public.profiles p
  where p.id = (select auth.uid());

  insert into public.auditoria (
    tabla_afectada, registro_id, operacion, usuario_id,
    datos_anteriores, datos_nuevos
  )
  values (
    tg_table_name, v_id, v_operacion, v_usuario, v_antes, v_despues
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

-- B. Auditar también perfiles, ubicaciones, categorías y fotografías
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'pabellones', 'pisos', 'ambientes',
    'categorias_equipos', 'fotografias_equipos'
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

-- C. El responsable lo fija el servidor, no el navegador
create or replace function private.asignar_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  -- Sin sesión (SQL Editor o procesos internos) se respeta lo que venga.
  if v_uid is null then
    return new;
  end if;

  if tg_table_name = 'movimientos' then
    new.responsable_id := v_uid;
  elsif tg_table_name = 'mantenimientos' then
    new.responsable_id := coalesce(new.responsable_id, v_uid);
  else
    new.creado_por := v_uid;
  end if;

  return new;
end;
$$;

drop trigger if exists asignar_actor on public.equipos;
create trigger asignar_actor
  before insert on public.equipos
  for each row execute function private.asignar_actor();

drop trigger if exists asignar_actor on public.fotografias_equipos;
create trigger asignar_actor
  before insert on public.fotografias_equipos
  for each row execute function private.asignar_actor();

drop trigger if exists asignar_actor on public.mantenimientos;
create trigger asignar_actor
  before insert on public.mantenimientos
  for each row execute function private.asignar_actor();

drop trigger if exists asignar_actor on public.movimientos;
create trigger asignar_actor
  before insert on public.movimientos
  for each row execute function private.asignar_actor();

-- D. Código institucional y autor original son inmutables
create or replace function private.proteger_equipos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.codigo_institucional is distinct from old.codigo_institucional then
    raise exception 'El código institucional de un equipo no puede modificarse.';
  end if;

  if new.creado_por is distinct from old.creado_por then
    raise exception 'No se puede cambiar quién registró el equipo.';
  end if;

  return new;
end;
$$;

drop trigger if exists proteger_equipos on public.equipos;
create trigger proteger_equipos
  before update on public.equipos
  for each row execute function private.proteger_equipos();

commit;