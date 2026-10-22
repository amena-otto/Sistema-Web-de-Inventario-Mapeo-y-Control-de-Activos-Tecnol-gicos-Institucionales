-- PRUEBAS DE RLS (no deja datos: todo se revierte al terminar)
-- Ejecuta el archivo completo en el SQL Editor. El resultado es una tabla;
-- las filas con resultado FALLA aparecen primero.

create or replace function pg_temp.intentar(p_uid uuid, p_sql text, p_rol text default 'authenticated')
returns text
language plpgsql
as $fn$
declare
  v_filas bigint;
  v_out text;
begin
  begin
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', p_uid, 'role', p_rol)::text, true);
    perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    execute format('set local role %I', p_rol);
    execute p_sql;
    get diagnostics v_filas = row_count;
    v_out := case when v_filas > 0 then 'PERMITIDO' else 'BLOQUEADO' end;
    raise exception using errcode = 'P0001', message = '__fin__';
  exception when others then
    if sqlerrm <> '__fin__' then
      v_out := 'BLOQUEADO';
    end if;
  end;
  return v_out;
end
$fn$;

create or replace function pg_temp.leer_como(p_uid uuid, p_sql text, p_rol text default 'authenticated')
returns text
language plpgsql
as $fn$
declare
  v_val text;
begin
  begin
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', p_uid, 'role', p_rol)::text, true);
    perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    execute format('set local role %I', p_rol);
    execute p_sql into v_val;
    raise exception using errcode = 'P0001', message = '__fin__';
  exception when others then
    if sqlerrm <> '__fin__' then
      v_val := 'ERROR: ' || sqlerrm;
    end if;
  end;
  return v_val;
end
$fn$;

-- Ejecuta p_mod como el usuario y luego lee p_leer como administrador del sistema
create or replace function pg_temp.escribir_y_leer(p_uid uuid, p_mod text, p_leer text)
returns text
language plpgsql
as $fn$
declare
  v_val text;
begin
  begin
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    set local role authenticated;
    execute p_mod;
    reset role;
    execute p_leer into v_val;
    raise exception using errcode = 'P0001', message = '__fin__';
  exception when others then
    if sqlerrm <> '__fin__' then
      v_val := 'ERROR: ' || sqlerrm;
    end if;
  end;
  return v_val;
end
$fn$;

create or replace function pg_temp.reg(p_prueba text, p_esperado text, p_obtenido text)
returns jsonb
language sql
as $fn$
  select jsonb_build_object(
    'prueba', p_prueba, 'esperado', p_esperado, 'obtenido', coalesce(p_obtenido, '(nulo)'),
    'resultado', case when p_esperado = p_obtenido then 'OK' else 'FALLA' end)
$fn$;

create or replace function pg_temp.correr_pruebas()
returns table (n bigint, prueba text, esperado text, obtenido text, resultado text)
language plpgsql
as $fn$
declare
  v_admin    uuid;
  v_tecnico  uuid;
  v_consulta uuid;
  v_pab uuid; v_piso uuid; v_amb1 uuid; v_amb2 uuid; v_cat uuid;
  v_pab_sin_dependencias uuid;
  v_eq uuid; v_eq_rel uuid; v_mant uuid; v_comp uuid; v_mov uuid;
  v_res jsonb := '[]'::jsonb;
  v_hay_bucket boolean;
begin
  -- Un usuario real de cada rol (el primero activo que exista)
  select id into v_admin    from public.profiles where rol = 'admin'    and activo order by created_at limit 1;
  select id into v_tecnico  from public.profiles where rol = 'tecnico'  and activo order by created_at limit 1;
  select id into v_consulta from public.profiles where rol = 'consulta' and activo order by created_at limit 1;

  if v_admin is null or v_tecnico is null or v_consulta is null then
    raise exception 'Se necesita al menos un usuario activo de cada rol (admin, tecnico, consulta).';
  end if;

  select exists (select 1 from storage.buckets where id = 'fotografias-equipos') into v_hay_bucket;

  begin
    -- Datos de prueba (se revierten al final)
    insert into public.pabellones (nombre) values ('ZZ-PRUEBA') returning id into v_pab;
    insert into public.pabellones (nombre)
      values ('ZZ-PRUEBA-ELIMINAR-UBICACION')
      returning id into v_pab_sin_dependencias;
    insert into public.pisos (pabellon_id, nombre, numero) values (v_pab, 'ZZ-PISO', 1) returning id into v_piso;
    insert into public.ambientes (piso_id, codigo, nombre, tipo) values (v_piso, 'ZZ1', 'ZZ Aula 1', 'aula') returning id into v_amb1;
    insert into public.ambientes (piso_id, codigo, nombre, tipo) values (v_piso, 'ZZ2', 'ZZ Aula 2', 'aula') returning id into v_amb2;
    insert into public.categorias_equipos (nombre) values ('ZZ-CATEGORIA') returning id into v_cat;
    insert into public.equipos (codigo_institucional, categoria_id, ambiente_id, nombre)
      values ('ZZ-EQP-0001', v_cat, v_amb1, 'Equipo de prueba') returning id into v_eq;
    insert into public.equipos (codigo_institucional, categoria_id, ambiente_id, nombre)
      values ('ZZ-EQP-0002', v_cat, v_amb1, 'Equipo relacionado de prueba') returning id into v_eq_rel;
    insert into public.mantenimientos (equipo_id, tipo, descripcion) values (v_eq, 'preventivo', 'prueba') returning id into v_mant;
    insert into public.componentes (equipo_id, tipo) values (v_eq, 'RAM') returning id into v_comp;
    insert into public.movimientos (equipo_id, ambiente_origen_id, ambiente_destino_id, motivo, responsable_id)
      values (v_eq, v_amb1, v_amb2, 'prueba', v_admin) returning id into v_mov;

    if v_hay_bucket then
      insert into storage.objects (bucket_id, name)
        values ('fotografias-equipos', 'equipos/' || v_eq || '/existente.webp');
    end if;

    -- 1. LECTURA
    v_res := v_res || pg_temp.reg('Consulta lee equipos', 'PERMITIDO', pg_temp.intentar(v_consulta, 'select 1 from public.equipos'));
    v_res := v_res || pg_temp.reg('Consulta lee ubicaciones (ambientes)', 'PERMITIDO', pg_temp.intentar(v_consulta, 'select 1 from public.ambientes'));
    v_res := v_res || pg_temp.reg('Consulta NO lee mantenimientos', 'BLOQUEADO', pg_temp.intentar(v_consulta, 'select 1 from public.mantenimientos'));
    v_res := v_res || pg_temp.reg('Consulta NO lee movimientos', 'BLOQUEADO', pg_temp.intentar(v_consulta, 'select 1 from public.movimientos'));
    v_res := v_res || pg_temp.reg('Consulta NO lee auditoría', 'BLOQUEADO', pg_temp.intentar(v_consulta, 'select 1 from public.auditoria'));
    v_res := v_res || pg_temp.reg('Técnico lee mantenimientos', 'PERMITIDO', pg_temp.intentar(v_tecnico, 'select 1 from public.mantenimientos'));
    v_res := v_res || pg_temp.reg('Técnico lee movimientos', 'PERMITIDO', pg_temp.intentar(v_tecnico, 'select 1 from public.movimientos'));
    v_res := v_res || pg_temp.reg('Técnico NO lee auditoría', 'BLOQUEADO', pg_temp.intentar(v_tecnico, 'select 1 from public.auditoria'));
    v_res := v_res || pg_temp.reg('Admin lee auditoría', 'PERMITIDO', pg_temp.intentar(v_admin, 'select 1 from public.auditoria'));
    v_res := v_res || pg_temp.reg('Consulta solo ve su propio perfil', '1',
      pg_temp.leer_como(v_consulta, 'select count(*)::text from public.profiles'));
    v_res := v_res || pg_temp.reg('Admin ve todos los perfiles',
      (select count(*)::text from public.profiles),
      pg_temp.leer_como(v_admin, 'select count(*)::text from public.profiles'));

    -- 2. EQUIPOS
    v_res := v_res || pg_temp.reg('Consulta NO registra equipos', 'BLOQUEADO', pg_temp.intentar(v_consulta,
      format('insert into public.equipos (codigo_institucional, categoria_id, ambiente_id, nombre) values (''ZZ-EQP-9001'', %L, %L, ''x'')', v_cat, v_amb1)));
    v_res := v_res || pg_temp.reg('Técnico registra equipos', 'PERMITIDO', pg_temp.intentar(v_tecnico,
      format('insert into public.equipos (codigo_institucional, categoria_id, ambiente_id, nombre) values (''ZZ-EQP-9002'', %L, %L, ''x'')', v_cat, v_amb1)));
    v_res := v_res || pg_temp.reg('Técnico edita equipos', 'PERMITIDO', pg_temp.intentar(v_tecnico,
      format('update public.equipos set nombre = ''editado'' where id = %L', v_eq)));
    v_res := v_res || pg_temp.reg('Técnico cambia estado operativo a almacén', 'PERMITIDO', pg_temp.intentar(v_tecnico,
      format('update public.equipos set estado_operativo = ''en_almacen'' where id = %L', v_eq)));
    v_res := v_res || pg_temp.reg('Consulta NO edita equipos', 'BLOQUEADO', pg_temp.intentar(v_consulta,
      format('update public.equipos set nombre = ''editado'' where id = %L', v_eq)));
    v_res := v_res || pg_temp.reg('Técnico registra componentes', 'PERMITIDO', pg_temp.intentar(v_tecnico,
      format('insert into public.componentes (equipo_id, tipo) values (%L, ''SSD'')', v_eq)));
    v_res := v_res || pg_temp.reg('Consulta NO registra componentes', 'BLOQUEADO', pg_temp.intentar(v_consulta,
      format('insert into public.componentes (equipo_id, tipo) values (%L, ''SSD'')', v_eq)));
    v_res := v_res || pg_temp.reg('Técnico relaciona equipos', 'PERMITIDO', pg_temp.intentar(v_tecnico,
      format('insert into public.relaciones_equipos (equipo_principal_id, equipo_relacionado_id, tipo_relacion) values (%L, %L, ''periferico'')', v_eq, v_eq_rel)));
    v_res := v_res || pg_temp.reg('Consulta NO relaciona equipos', 'BLOQUEADO', pg_temp.intentar(v_consulta,
      format('insert into public.relaciones_equipos (equipo_principal_id, equipo_relacionado_id, tipo_relacion) values (%L, %L, ''periferico'')', v_eq, v_eq_rel)));
    v_res := v_res || pg_temp.reg('Técnico coloca marcador de equipo en el plano', 'PERMITIDO', pg_temp.intentar(v_tecnico,
      format('insert into public.marcadores_mapa (equipo_id, piso_id, x, y) values (%L, %L, 25, 50)', v_eq, v_piso)));
    v_res := v_res || pg_temp.reg('Consulta NO coloca marcadores', 'BLOQUEADO', pg_temp.intentar(v_consulta,
      format('insert into public.marcadores_mapa (equipo_id, piso_id, x, y) values (%L, %L, 70, 70)', v_eq_rel, v_piso)));
    v_res := v_res || pg_temp.reg('Marcador NO puede exceder coordenadas del plano', 'BLOQUEADO', pg_temp.intentar(v_admin,
      format('insert into public.marcadores_mapa (equipo_id, piso_id, x, y) values (%L, %L, 120, 50)', v_eq_rel, v_piso)));
    v_res := v_res || pg_temp.reg('Técnico registra metadatos de fotografías', 'PERMITIDO', pg_temp.intentar(v_tecnico,
      format('insert into public.fotografias_equipos (equipo_id, ruta_storage) values (%L, %L)', v_eq, 'equipos/' || v_eq || '/metadata-test.webp')));
    v_res := v_res || pg_temp.reg('Consulta NO registra metadatos de fotografías', 'BLOQUEADO', pg_temp.intentar(v_consulta,
      format('insert into public.fotografias_equipos (equipo_id, ruta_storage) values (%L, %L)', v_eq, 'equipos/' || v_eq || '/metadata-test.webp')));
    v_res := v_res || pg_temp.reg('Técnico NO da de baja equipos', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
      format('update public.equipos set situacion = ''baja'', deleted_at = now() where id = %L', v_eq)));
    v_res := v_res || pg_temp.reg('Admin da de baja equipos', 'PERMITIDO', pg_temp.intentar(v_admin,
      format('update public.equipos set situacion = ''baja'', deleted_at = now() where id = %L', v_eq)));
    v_res := v_res || pg_temp.reg('Nadie cambia el código institucional (ni admin)', 'BLOQUEADO', pg_temp.intentar(v_admin,
      format('update public.equipos set codigo_institucional = ''ZZ-OTRO'' where id = %L', v_eq)));
    v_res := v_res || pg_temp.reg('Técnico NO borra equipos', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
      format('delete from public.equipos where id = %L', v_eq)));
    v_res := v_res || pg_temp.reg('Admin NO borra equipos (solo baja lógica)', 'BLOQUEADO', pg_temp.intentar(v_admin,
      format('delete from public.equipos where id = %L', v_eq)));

    -- 3. UBICACIONES Y CATEGORÍAS (solo admin escribe)
    v_res := v_res || pg_temp.reg('Consulta NO crea pabellones', 'BLOQUEADO', pg_temp.intentar(v_consulta, 'insert into public.pabellones (nombre) values (''ZZ-X1'')'));
    v_res := v_res || pg_temp.reg('Técnico NO crea pabellones', 'BLOQUEADO', pg_temp.intentar(v_tecnico, 'insert into public.pabellones (nombre) values (''ZZ-X2'')'));
    v_res := v_res || pg_temp.reg('Admin crea pabellones', 'PERMITIDO', pg_temp.intentar(v_admin, 'insert into public.pabellones (nombre) values (''ZZ-X3'')'));
    v_res := v_res || pg_temp.reg('Técnico NO edita ambientes', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
      format('update public.ambientes set nombre = ''x'' where id = %L', v_amb1)));
    v_res := v_res || pg_temp.reg('Admin edita ambientes', 'PERMITIDO', pg_temp.intentar(v_admin,
      format('update public.ambientes set nombre = ''x'' where id = %L', v_amb1)));
    v_res := v_res || pg_temp.reg('Técnico NO elimina ubicaciones', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
      format('delete from public.pabellones where id = %L', v_pab_sin_dependencias)));
    v_res := v_res || pg_temp.reg('Admin elimina pabellones sin dependencias', 'PERMITIDO', pg_temp.intentar(v_admin,
      format('delete from public.pabellones where id = %L', v_pab_sin_dependencias)));
    v_res := v_res || pg_temp.reg('Técnico NO crea categorías', 'BLOQUEADO', pg_temp.intentar(v_tecnico, 'insert into public.categorias_equipos (nombre) values (''ZZ-C2'')'));

    -- 4. MANTENIMIENTOS, COMPONENTES Y MOVIMIENTOS
    v_res := v_res || pg_temp.reg('Técnico registra mantenimientos', 'PERMITIDO', pg_temp.intentar(v_tecnico,
      format('insert into public.mantenimientos (equipo_id, tipo, descripcion) values (%L, ''correctivo'', ''x'')', v_eq)));
    v_res := v_res || pg_temp.reg('Consulta NO registra mantenimientos', 'BLOQUEADO', pg_temp.intentar(v_consulta,
      format('insert into public.mantenimientos (equipo_id, tipo, descripcion) values (%L, ''correctivo'', ''x'')', v_eq)));
    v_res := v_res || pg_temp.reg('Técnico actualiza un mantenimiento (prueba el trigger de auditoría)', 'PERMITIDO', pg_temp.intentar(v_tecnico,
      format('update public.mantenimientos set estado = ''en_proceso'' where id = %L', v_mant)));
    v_res := v_res || pg_temp.reg('Técnico actualiza un componente (prueba el trigger de auditoría)', 'PERMITIDO', pg_temp.intentar(v_tecnico,
      format('update public.componentes set marca = ''x'' where id = %L', v_comp)));
    v_res := v_res || pg_temp.reg('Técnico registra movimientos', 'PERMITIDO', pg_temp.intentar(v_tecnico,
      format('insert into public.movimientos (equipo_id, ambiente_origen_id, ambiente_destino_id, motivo, responsable_id) values (%L, %L, %L, ''x'', %L)', v_eq, v_amb2, v_amb1, v_tecnico)));
    v_res := v_res || pg_temp.reg('Consulta NO registra movimientos', 'BLOQUEADO', pg_temp.intentar(v_consulta,
      format('insert into public.movimientos (equipo_id, ambiente_origen_id, ambiente_destino_id, motivo, responsable_id) values (%L, %L, %L, ''x'', %L)', v_eq, v_amb2, v_amb1, v_consulta)));
    v_res := v_res || pg_temp.reg('Nadie modifica movimientos (historial inmutable)', 'BLOQUEADO', pg_temp.intentar(v_admin,
      format('update public.movimientos set motivo = ''alterado'' where id = %L', v_mov)));
    v_res := v_res || pg_temp.reg('Nadie borra movimientos', 'BLOQUEADO', pg_temp.intentar(v_admin,
      format('delete from public.movimientos where id = %L', v_mov)));

    -- 5. PERFILES
    v_res := v_res || pg_temp.reg('Técnico NO se sube de rol', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
      format('update public.profiles set rol = ''admin'' where id = %L', v_tecnico)));
    v_res := v_res || pg_temp.reg('Consulta NO se sube de rol', 'BLOQUEADO', pg_temp.intentar(v_consulta,
      format('update public.profiles set rol = ''admin'' where id = %L', v_consulta)));
    v_res := v_res || pg_temp.reg('Admin cambia el rol de otro usuario', 'PERMITIDO', pg_temp.intentar(v_admin,
      format('update public.profiles set rol = ''tecnico'' where id = %L', v_consulta)));
    v_res := v_res || pg_temp.reg('Admin NO se desactiva a sí mismo', 'BLOQUEADO', pg_temp.intentar(v_admin,
      format('update public.profiles set activo = false where id = %L', v_admin)));
    v_res := v_res || pg_temp.reg('Admin NO borra perfiles', 'BLOQUEADO', pg_temp.intentar(v_admin,
      format('delete from public.profiles where id = %L', v_consulta)));

    -- 6. QUIÉN HIZO CADA COSA LO DECIDE EL SERVIDOR
    v_res := v_res || pg_temp.reg('Movimiento: responsable = usuario autenticado (aunque el navegador mande otro)', v_tecnico::text,
      pg_temp.escribir_y_leer(v_tecnico,
        format('insert into public.movimientos (id, equipo_id, ambiente_origen_id, ambiente_destino_id, motivo, responsable_id) values (''00000000-0000-0000-0000-0000000000a1'', %L, %L, %L, ''x'', %L)', v_eq, v_amb2, v_amb1, v_admin),
        'select responsable_id::text from public.movimientos where id = ''00000000-0000-0000-0000-0000000000a1'''));
    v_res := v_res || pg_temp.reg('Equipo: creado_por = usuario autenticado (aunque el navegador mande otro)', v_tecnico::text,
      pg_temp.escribir_y_leer(v_tecnico,
        format('insert into public.equipos (codigo_institucional, categoria_id, ambiente_id, nombre, creado_por) values (''ZZ-EQP-9003'', %L, %L, ''ZZ-ACTOR-TEST'', %L)', v_cat, v_amb1, v_admin),
        'select creado_por::text from public.equipos where nombre = ''ZZ-ACTOR-TEST'''));
    v_res := v_res || pg_temp.reg('Equipo: código institucional generado por servidor',
      'true',
      (pg_temp.escribir_y_leer(v_tecnico,
        format('insert into public.equipos (codigo_institucional, categoria_id, ambiente_id, nombre) values (''ZZ-EQP-MANUAL'', %L, %L, ''ZZ-CODE-TEST'')', v_cat, v_amb1),
        'select codigo_institucional from public.equipos where nombre = ''ZZ-CODE-TEST''')) ~ '^OT-EQP-[0-9]{6,}$')::text);
    v_res := v_res || pg_temp.reg('Auditoría registra al usuario real del cambio', v_tecnico::text,
      pg_temp.escribir_y_leer(v_tecnico,
        format('update public.mantenimientos set estado = ''completado'' where id = %L', v_mant),
        format('select usuario_id::text from public.auditoria where registro_id = %L and operacion = ''UPDATE'' order by fecha desc limit 1', v_mant)));

    -- 7. ACCESO SIN SESIÓN
    v_res := v_res || pg_temp.reg('Sin sesión NO lee equipos', 'BLOQUEADO', pg_temp.intentar(null, 'select 1 from public.equipos', 'anon'));
    v_res := v_res || pg_temp.reg('Sin sesión NO lee perfiles', 'BLOQUEADO', pg_temp.intentar(null, 'select 1 from public.profiles', 'anon'));
    v_res := v_res || pg_temp.reg('Sin sesión NO escribe', 'BLOQUEADO', pg_temp.intentar(null, 'insert into public.pabellones (nombre) values (''ZZ-ANON'')', 'anon'));

    -- 8. FOTOGRAFÍAS (Storage)
    v_res := v_res || pg_temp.reg('Existe el bucket privado fotografias-equipos', 'true', v_hay_bucket::text);
    if v_hay_bucket then
      v_res := v_res || pg_temp.reg('El bucket NO es público', 'false',
        (select public::text from storage.buckets where id = 'fotografias-equipos'));
      v_res := v_res || pg_temp.reg('Consulta ve fotografías', 'PERMITIDO', pg_temp.intentar(v_consulta, 'select 1 from storage.objects'));
      v_res := v_res || pg_temp.reg('Sin sesión NO ve fotografías', 'BLOQUEADO', pg_temp.intentar(null, 'select 1 from storage.objects', 'anon'));
      v_res := v_res || pg_temp.reg('Técnico sube foto a equipos/{equipo}/', 'PERMITIDO', pg_temp.intentar(v_tecnico,
        format('insert into storage.objects (bucket_id, name) values (''fotografias-equipos'', %L)', 'equipos/' || v_eq || '/nueva.webp')));
      v_res := v_res || pg_temp.reg('Consulta NO sube fotos', 'BLOQUEADO', pg_temp.intentar(v_consulta,
        format('insert into storage.objects (bucket_id, name) values (''fotografias-equipos'', %L)', 'equipos/' || v_eq || '/nueva.webp')));
      v_res := v_res || pg_temp.reg('Técnico NO sube fuera de equipos/', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
        'insert into storage.objects (bucket_id, name) values (''fotografias-equipos'', ''otra/carpeta/x.webp'')'));
      v_res := v_res || pg_temp.reg('Técnico NO sube a un equipo inexistente', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
        'insert into storage.objects (bucket_id, name) values (''fotografias-equipos'', ''equipos/00000000-0000-0000-0000-000000000000/x.webp'')'));
      v_res := v_res || pg_temp.reg('Nadie borra fotografías desde la API', 'BLOQUEADO', pg_temp.intentar(v_admin, 'delete from storage.objects'));
    end if;

    -- 9. CUENTA DESACTIVADA (sesión ya abierta)
    update public.profiles set activo = false where id = v_tecnico;
    v_res := v_res || pg_temp.reg('Desactivado: NO lee equipos', 'BLOQUEADO', pg_temp.intentar(v_tecnico, 'select 1 from public.equipos'));
    v_res := v_res || pg_temp.reg('Desactivado: NO registra equipos', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
      format('insert into public.equipos (codigo_institucional, categoria_id, ambiente_id, nombre) values (''ZZ-EQP-9100'', %L, %L, ''x'')', v_cat, v_amb1)));
    v_res := v_res || pg_temp.reg('Desactivado: NO registra mantenimientos', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
      format('insert into public.mantenimientos (equipo_id, tipo, descripcion) values (%L, ''correctivo'', ''x'')', v_eq)));
    v_res := v_res || pg_temp.reg('Desactivado: sigue leyendo su propio perfil (para que la app lo detecte)', 'PERMITIDO',
      pg_temp.intentar(v_tecnico, format('select 1 from public.profiles where id = %L', v_tecnico)));
    if v_hay_bucket then
      v_res := v_res || pg_temp.reg('Desactivado: NO ve fotografías', 'BLOQUEADO', pg_temp.intentar(v_tecnico, 'select 1 from storage.objects'));
    end if;

    raise exception using errcode = 'P0001', message = '__fin__';
  exception when others then
    if sqlerrm <> '__fin__' then
      raise;
    end if;
  end;

  return query
    select t.n, t.e ->> 'prueba', t.e ->> 'esperado', t.e ->> 'obtenido', t.e ->> 'resultado'
    from jsonb_array_elements(v_res) with ordinality as t(e, n);
end
$fn$;

select * from pg_temp.correr_pruebas() order by (resultado = 'OK'), n;