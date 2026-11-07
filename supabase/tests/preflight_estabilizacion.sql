-- Solo lectura. No ejecutar db push: produccion carece de historial registrado.
select
  to_regclass('supabase_migrations.schema_migrations') as historial_migraciones,
  to_regclass('public.marcadores_mapa') as marcadores_mapa,
  to_regprocedure('private.limpiar_marcador_al_mover_equipo()') as funcion_obsoleta,
  to_regclass('public.eliminaciones_pendientes') as pendientes,
  (select jsonb_agg(tgname order by tgname) from pg_trigger
    where tgrelid = 'public.equipos'::regclass and not tgisinternal) as triggers,
  (select jsonb_agg(jsonb_build_object('tabla', conrelid::regclass::text, 'definicion', pg_get_constraintdef(oid)))
    from pg_constraint where confrelid = 'public.equipos'::regclass) as dependencias,
  pg_get_functiondef('public.eliminar_equipo_dado_de_baja(uuid,text,uuid)'::regprocedure) as rpc,
  (select jsonb_object_agg(relname, relrowsecurity) from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r') as rls,
  jsonb_build_object(
    'equipos', (select count(*) from public.equipos),
    'profiles', (select count(*) from public.profiles),
    'usuarios', (select count(*) from auth.users),
    'auditoria', (select count(*) from public.auditoria),
    'fotografias', (select count(*) from public.fotografias_equipos),
    'componentes', (select count(*) from public.componentes),
    'movimientos', (select count(*) from public.movimientos),
    'mantenimientos', (select count(*) from public.mantenimientos)
  ) as conteos;
