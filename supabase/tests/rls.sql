-- PRUEBAS RLS PARA STAGING (no ejecutar en producción)
-- Requiere un usuario activo por rol: admin, tecnico y consulta.
-- Todo se revierte al terminar. Ejecuta el archivo completo en el SQL Editor. El resultado es una tabla;
-- las filas con resultado FALLA aparecen primero.

create or replace function pg_temp.intentar(p_uid uuid, p_sql text, p_rol text default 'authenticated')
returns text
language plpgsql
as $fn$
declare
  v_filas bigint;
  v_out text;
  v_sqlstate text;
  v_ejecutando boolean := false;
begin
  begin
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', p_uid, 'role', p_rol)::text, true);
    perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    execute format('set local role %I', p_rol);
    v_ejecutando := true;
    execute p_sql;
    get diagnostics v_filas = row_count;
    v_out := case when v_filas > 0 then 'PERMITIDO' else 'BLOQUEADO' end;
    raise exception using errcode = 'P0001', message = '__fin__';
  exception when others then
    if sqlerrm <> '__fin__' then
      get stacked diagnostics v_sqlstate = returned_sqlstate;
      v_out := case
        when v_ejecutando and v_sqlstate in ('42501', 'P0001') then 'BLOQUEADO'
        else 'ERROR: ' || v_sqlstate
      end;
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

-- Ejecuta p_sql como el usuario indicado y conserva los cambios si no hay error.
create or replace function pg_temp.ejecutar_como(p_uid uuid, p_sql text)
returns text
language plpgsql
as $fn$
begin
  begin
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    set local role authenticated;
    execute p_sql;
    reset role;
    return 'OK';
  exception when others then
    reset role;
    return 'ERROR: ' || sqlerrm;
  end;
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
  v_eq_mant uuid; v_mant_reasig uuid; v_mant_motivo uuid; v_eq_vencido uuid;
  v_eq_purga uuid; v_codigo_purga text; v_comp_purga uuid; v_mant_purga uuid; v_mov_purga uuid;
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

    -- Fixtures para el ciclo de vida de una intervención (equipo activo)
    insert into public.equipos (codigo_institucional, categoria_id, ambiente_id, nombre)
      values ('ZZ-EQP-MANT', v_cat, v_amb1, 'Equipo para ciclo de mantenimiento') returning id into v_eq_mant;
    insert into public.mantenimientos (equipo_id, tipo, fecha_mantenimiento, descripcion, problema_reportado, estado, responsable_id)
      values (v_eq_mant, 'preventivo', current_date, 'prueba', 'prueba', 'pendiente', v_tecnico)
      returning id into v_mant;
    insert into public.mantenimientos (equipo_id, tipo, fecha_mantenimiento, descripcion, problema_reportado, estado, responsable_id)
      values (v_eq_mant, 'correctivo', current_date, 'reasignación', 'reasignación', 'pendiente', v_tecnico)
      returning id into v_mant_reasig;
    insert into public.mantenimientos (equipo_id, tipo, fecha_mantenimiento, descripcion, problema_reportado, estado, responsable_id)
      values (v_eq_mant, 'correctivo', current_date, 'motivo', 'motivo', 'pendiente', v_tecnico)
      returning id into v_mant_motivo;

    insert into public.equipos (codigo_institucional, categoria_id, ambiente_id, nombre)
      values ('ZZ-EQP-VENCIDO', v_cat, v_amb1, 'Equipo con revisión vencida') returning id into v_eq_vencido;
    insert into public.mantenimientos (equipo_id, tipo, fecha_mantenimiento, descripcion, problema_reportado, estado, responsable_id, proxima_revision)
      values (v_eq_vencido, 'preventivo', current_date - 30, 'revisión', 'revisión', 'completado', v_tecnico, current_date - 10);

    -- Fixtures para la baja definitiva (equipo ya dado de baja)
    insert into public.equipos (codigo_institucional, categoria_id, ambiente_id, nombre)
      values ('ZZ-EQP-PURGA', v_cat, v_amb1, 'Equipo para baja definitiva') returning id into v_eq_purga;
    insert into public.componentes (equipo_id, tipo)
      values (v_eq_purga, 'SSD') returning id into v_comp_purga;
    insert into public.mantenimientos (equipo_id, tipo, descripcion)
      values (v_eq_purga, 'preventivo', 'prueba de baja definitiva') returning id into v_mant_purga;
    insert into public.movimientos (equipo_id, ambiente_origen_id, ambiente_destino_id, motivo, responsable_id)
      values (v_eq_purga, v_amb1, v_amb2, 'prueba de baja definitiva', v_admin) returning id into v_mov_purga;
    update public.equipos
      set situacion = 'baja', deleted_at = now()
      where id = v_eq_purga;
    select codigo_institucional into v_codigo_purga
      from public.equipos where id = v_eq_purga;

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
    v_res := v_res || pg_temp.reg('Nadie modifica la auditoría', 'BLOQUEADO', pg_temp.intentar(v_admin, 'update public.auditoria set operacion = ''UPDATE'''));
    v_res := v_res || pg_temp.reg('Nadie borra la auditoría', 'BLOQUEADO', pg_temp.intentar(v_admin, 'delete from public.auditoria'));
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
    v_res := v_res || pg_temp.reg('Admin NO borra equipos directamente (la baja definitiva usa la Edge Function)', 'BLOQUEADO', pg_temp.intentar(v_admin,
      format('delete from public.equipos where id = %L', v_eq)));
    v_res := v_res || pg_temp.reg('Admin NO ejecuta la baja definitiva directamente (solo Edge Function)', 'BLOQUEADO', pg_temp.intentar(v_admin,
      format('select public.eliminar_equipo_dado_de_baja(%L, %L, %L)', v_eq_purga, v_codigo_purga, v_admin)));

    -- La Edge Function (service_role) ejecuta la purga; aquí se simula el servidor.
    perform public.eliminar_equipo_dado_de_baja(v_eq_purga, v_codigo_purga, v_admin);

    v_res := v_res || pg_temp.reg('Baja definitiva deja constancia permanente', '1',
      (select count(*)::text from public.equipos_eliminados where equipo_id = v_eq_purga));
    v_res := v_res || pg_temp.reg('Baja definitiva elimina el equipo', '0',
      (select count(*)::text from public.equipos where id = v_eq_purga));
    v_res := v_res || pg_temp.reg('Baja definitiva conserva la auditoría del equipo', 'true',
      (select (count(*) > 0)::text from public.auditoria where registro_id = v_eq_purga));
    v_res := v_res || pg_temp.reg('Baja definitiva conserva la auditoría de componentes', 'true',
      (select (count(*) > 0)::text from public.auditoria where registro_id = v_comp_purga));
    v_res := v_res || pg_temp.reg('Baja definitiva conserva la auditoría de mantenimientos', 'true',
      (select (count(*) > 0)::text from public.auditoria where registro_id = v_mant_purga));
    v_res := v_res || pg_temp.reg('Baja definitiva conserva la auditoría de movimientos', 'true',
      (select (count(*) > 0)::text from public.auditoria where registro_id = v_mov_purga));

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

    -- 4. MANTENIMIENTOS: ESCRITURA SOLO POR FUNCIONES Y CICLO DE ESTADO
    v_res := v_res || pg_temp.reg('Técnico registra mantenimientos por RPC', 'PERMITIDO', pg_temp.intentar(v_tecnico,
      format('select public.registrar_mantenimiento(%L, ''correctivo'', current_date, ''prueba rpc'', null, null, null, null, null, null, ''pendiente'')', v_eq_mant)));
    v_res := v_res || pg_temp.reg('Técnico NO inserta mantenimientos directamente', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
      format('insert into public.mantenimientos (equipo_id, tipo, problema_reportado) values (%L, ''correctivo'', ''x'')', v_eq_mant)));
    v_res := v_res || pg_temp.reg('Técnico NO actualiza mantenimientos directamente', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
      format('update public.mantenimientos set estado = ''en_proceso'' where id = %L', v_mant)));
    v_res := v_res || pg_temp.reg('Consulta NO registra mantenimientos', 'BLOQUEADO', pg_temp.intentar(v_consulta,
      format('select public.registrar_mantenimiento(%L, ''correctivo'', current_date, ''x'', null, null, null, null, null, null, ''pendiente'')', v_eq_mant)));
    v_res := v_res || pg_temp.reg('Alta con cambio de estado del equipo exige motivo', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
      format('select public.registrar_mantenimiento(%L, ''correctivo'', current_date, ''x'', null, null, null, null, null, null, ''pendiente'', ''inoperativo'')', v_eq_mant)));
    v_res := v_res || pg_temp.reg('Alta con cambio de estado y motivo se registra', 'PERMITIDO', pg_temp.intentar(v_tecnico,
      format('select public.registrar_mantenimiento(%L, ''correctivo'', current_date, ''x'', null, null, null, null, null, null, ''pendiente'', ''inoperativo'', null, ''Falla detectada'')', v_eq_mant)));

    v_res := v_res || pg_temp.reg('Técnico inicia la intervención (pendiente → en_proceso)', 'OK', pg_temp.ejecutar_como(v_tecnico,
      format('select public.actualizar_mantenimiento(%L, ''en_proceso'', ''prueba'', ''diagnóstico'', ''acciones'', null, null, null, null)', v_mant)));
    v_res := v_res || pg_temp.reg('La transición queda en el historial', '1',
      (select count(*)::text from public.mantenimiento_cambios_estado where mantenimiento_id = v_mant));
    v_res := v_res || pg_temp.reg('Técnico NO completa sin diagnóstico, acciones y resultado', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
      format('select public.actualizar_mantenimiento(%L, ''completado'', ''prueba'', null, null, null, null, null, null)', v_mant)));
    v_res := v_res || pg_temp.reg('Técnico completa con datos y estado del equipo', 'OK', pg_temp.ejecutar_como(v_tecnico,
      format('select public.actualizar_mantenimiento(%L, ''completado'', ''prueba'', ''diagnóstico'', ''acciones'', ''RAM'', ''resuelto'', ''ok'', null, ''operativo'', ''Equipo reparado'')', v_mant)));
    v_res := v_res || pg_temp.reg('La intervención queda completada', 'completado',
      (select estado from public.mantenimientos where id = v_mant));
    v_res := v_res || pg_temp.reg('El equipo queda en el estado indicado', 'operativo',
      (select estado_operativo from public.equipos where id = v_eq_mant));
    v_res := v_res || pg_temp.reg('Técnico NO reabre una intervención completada', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
      format('select public.actualizar_mantenimiento(%L, ''en_proceso'', ''prueba'', null, null, null, null, null, null)', v_mant)));
    v_res := v_res || pg_temp.reg('Técnico NO edita una intervención completada', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
      format('select public.actualizar_mantenimiento(%L, ''completado'', ''prueba'', ''diagnóstico'', ''acciones'', null, ''resuelto'', null, null)', v_mant)));
    v_res := v_res || pg_temp.reg('Admin edita una intervención completada', 'OK', pg_temp.ejecutar_como(v_admin,
      format('select public.actualizar_mantenimiento(%L, ''completado'', ''prueba'', ''diagnóstico'', ''acciones'', null, ''resuelto'', ''ok'', null)', v_mant)));
    v_res := v_res || pg_temp.reg('Técnico NO reasigna la intervención a otro usuario', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
      format('select public.actualizar_mantenimiento(%L, ''pendiente'', ''reasignación'', null, null, null, null, null, null, null, null, %L)', v_mant_reasig, v_admin)));
    v_res := v_res || pg_temp.reg('Admin reasigna la intervención', 'OK', pg_temp.ejecutar_como(v_admin,
      format('select public.actualizar_mantenimiento(%L, ''pendiente'', ''reasignación'', null, null, null, null, null, null, null, null, %L)', v_mant_reasig, v_admin)));
    v_res := v_res || pg_temp.reg('La reasignación queda registrada', v_admin::text,
      (select responsable_id::text from public.mantenimientos where id = v_mant_reasig));
    v_res := v_res || pg_temp.reg('Cambio de estado del equipo sin motivo se rechaza', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
      format('select public.actualizar_mantenimiento(%L, ''en_proceso'', ''motivo'', ''d'', ''a'', null, ''r'', null, null, ''inoperativo'', null)', v_mant_motivo)));
    v_res := v_res || pg_temp.reg('Cambio de estado del equipo con motivo se registra', 'OK', pg_temp.ejecutar_como(v_tecnico,
      format('select public.actualizar_mantenimiento(%L, ''en_proceso'', ''motivo'', ''d'', ''a'', null, ''r'', null, null, ''inoperativo'', ''Falla detectada'')', v_mant_motivo)));
    v_res := v_res || pg_temp.reg('El cambio de estado del equipo queda en el historial', '1',
      (select count(*)::text from public.mantenimiento_cambios_estado where mantenimiento_id = v_mant_motivo and estado_equipo_nuevo = 'inoperativo'));
    v_res := v_res || pg_temp.reg('Técnico lee cambios de estado', 'PERMITIDO', pg_temp.intentar(v_tecnico,
      'select 1 from public.mantenimiento_cambios_estado'));
    v_res := v_res || pg_temp.reg('Consulta NO lee cambios de estado', 'BLOQUEADO', pg_temp.intentar(v_consulta,
      'select 1 from public.mantenimiento_cambios_estado'));
    v_res := v_res || pg_temp.reg('Nadie inserta cambios de estado directamente', 'BLOQUEADO', pg_temp.intentar(v_admin,
      format('insert into public.mantenimiento_cambios_estado (mantenimiento_id, equipo_id, estado_mantenimiento_nuevo) values (%L, %L, ''pendiente'')', v_mant, v_eq_mant)));
    v_res := v_res || pg_temp.reg('Técnico consulta indicadores', 'PERMITIDO', pg_temp.intentar(v_tecnico,
      'select 1 from public.indicadores_mantenimiento()'));
    v_res := v_res || pg_temp.reg('Consulta NO consulta indicadores', 'BLOQUEADO', pg_temp.intentar(v_consulta,
      'select 1 from public.indicadores_mantenimiento()'));
    v_res := v_res || pg_temp.reg('Revisión vencida incluye la última intervención completada', '1',
      pg_temp.leer_como(v_tecnico, format('select count(*)::text from public.equipos_revision_vencida() where equipo_id = %L', v_eq_vencido)));

    v_res := v_res || pg_temp.reg('Técnico actualiza un componente (prueba el trigger de auditoría)', 'PERMITIDO', pg_temp.intentar(v_tecnico,
      format('update public.componentes set marca = ''x'' where id = %L', v_comp)));
    v_res := v_res || pg_temp.reg('Técnico NO inserta movimientos directamente', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
      format('insert into public.movimientos (equipo_id, ambiente_origen_id, ambiente_destino_id, motivo, responsable_id) values (%L, %L, %L, ''x'', %L)', v_eq, v_amb2, v_amb1, v_tecnico)));
    v_res := v_res || pg_temp.reg('Consulta NO registra movimientos', 'BLOQUEADO', pg_temp.intentar(v_consulta,
      format('insert into public.movimientos (equipo_id, ambiente_origen_id, ambiente_destino_id, motivo, responsable_id) values (%L, %L, %L, ''x'', %L)', v_eq, v_amb2, v_amb1, v_consulta)));
    v_res := v_res || pg_temp.reg('Nadie modifica movimientos (historial inmutable)', 'BLOQUEADO', pg_temp.intentar(v_admin,
      format('update public.movimientos set motivo = ''alterado'' where id = %L', v_mov)));
    v_res := v_res || pg_temp.reg('Nadie borra movimientos', 'BLOQUEADO', pg_temp.intentar(v_admin,
      format('delete from public.movimientos where id = %L', v_mov)));
    v_res := v_res || pg_temp.reg('Técnico NO cambia ubicación sin movimiento', 'BLOQUEADO', pg_temp.intentar(v_tecnico,
      format('update public.equipos set ambiente_id = %L where id = %L', v_amb2, v_eq)));

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
    v_res := v_res || pg_temp.reg('Movimiento RPC registra al usuario autenticado', v_tecnico::text,
      pg_temp.escribir_y_leer(v_tecnico,
        format('select public.registrar_movimiento(%L, %L, %L, current_date, ''prueba-rpc'', ''Prueba'')', v_eq, v_amb2, v_admin),
        format('select responsable_id::text from public.movimientos where equipo_id = %L and motivo = ''prueba-rpc'' order by created_at desc limit 1', v_eq)));
    v_res := v_res || pg_temp.reg('Equipo: creado_por = usuario autenticado (aunque el navegador mande otro)', v_tecnico::text,
      pg_temp.escribir_y_leer(v_tecnico,
        format('insert into public.equipos (codigo_institucional, categoria_id, ambiente_id, nombre, creado_por) values (''ZZ-EQP-9003'', %L, %L, ''ZZ-ACTOR-TEST'', %L)', v_cat, v_amb1, v_admin),
        'select creado_por::text from public.equipos where nombre = ''ZZ-ACTOR-TEST'''));
    v_res := v_res || pg_temp.reg('Equipo: código institucional generado por servidor',
      'true',
      (pg_temp.escribir_y_leer(v_tecnico,
        format('insert into public.equipos (codigo_institucional, categoria_id, ambiente_id, nombre) values (''ZZ-EQP-MANUAL'', %L, %L, ''ZZ-CODE-TEST'')', v_cat, v_amb1),
        'select codigo_institucional from public.equipos where nombre = ''ZZ-CODE-TEST''') ~ '^OT-EQP-[0-9]{6,}$')::text);
    v_res := v_res || pg_temp.reg('Auditoría registra al usuario real del cambio', v_tecnico::text,
      pg_temp.escribir_y_leer(v_tecnico,
        format('select public.actualizar_mantenimiento(%L, ''en_proceso'', ''motivo'', ''d'', ''a'', null, ''r'', null, null, null, null)', v_mant_motivo),
        format('select usuario_id::text from public.auditoria where registro_id = %L and operacion = ''UPDATE'' order by fecha desc limit 1', v_mant_motivo)));

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
      format('select public.registrar_mantenimiento(%L, ''correctivo'', current_date, ''x'', null, null, null, null, null, null, ''pendiente'')', v_eq_mant)));
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