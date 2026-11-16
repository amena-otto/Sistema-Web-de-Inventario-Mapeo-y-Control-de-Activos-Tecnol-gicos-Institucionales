import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { mismosIds, compartidosExternos } from '../src/utils/equiposCompartidos.ts'
const equipo='11111111-1111-4111-8111-111111111111'
const marketing='22222222-2222-4222-8222-222222222222'
const contabilidad='33333333-3333-4333-8333-333333333333'
const lab='44444444-4444-4444-8444-444444444444'
const usuario='55555555-5555-4555-8555-555555555555'
const inactiva='66666666-6666-4666-8666-666666666666'
const heredada='77777777-7777-4777-8777-777777777777'
const migration=readFileSync(new URL('../supabase/migrations/020_equipos_compartidos.sql',import.meta.url),'utf8')

test('compartidos externos deduplicados; no repite el activo físico ni equipos de baja',()=>{
 const e={id:equipo,ambiente_id:marketing,situacion:'activo'}
 assert.deepEqual(compartidosExternos([e,e,{...e,id:'baja',situacion:'baja'}],contabilidad),[e])
 assert.deepEqual(compartidosExternos([e],marketing),[])
 assert.ok(mismosIds([marketing,contabilidad],[contabilidad,marketing,marketing]))
 assert.equal(mismosIds([marketing],[]),false)
})

test('compartir preserva ubicación y totales, valida permisos, concurrencia y revocación atómica',async(t)=>{
 const db=new PGlite()
 try {
 await db.exec(`create role anon;create role authenticated;
 create schema private;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function private.tiene_rol(roles text[]) returns boolean language sql stable as $$select current_setting('test.role',true)=any(roles)$$;
 create table profiles(id uuid primary key);
 insert into profiles values ('${usuario}');
 create table pabellones(id uuid primary key default gen_random_uuid(),nombre text);
 create table pisos(id uuid primary key default gen_random_uuid(),pabellon_id uuid references pabellones(id));
 create table ambientes(id uuid primary key,tipo text,nombre text,activo boolean,piso_id uuid references pisos(id));
 insert into ambientes values ('${marketing}','oficina','Marketing',true,null),('${contabilidad}','oficina','Contabilidad',true,null),('${lab}','laboratorio','Laboratorio',true,null),('${inactiva}','oficina','Inactiva',false,null);
 insert into pabellones(nombre) values ('AREAS');
 insert into pisos(pabellon_id) select id from pabellones;
 insert into ambientes select '${heredada}','aula','Admisión',true,id from pisos;
 create table equipos(id uuid primary key,nombre text,ambiente_id uuid references ambientes(id),situacion text,deleted_at timestamptz);
 insert into equipos values ('${equipo}','Impresora', '${marketing}','activo',null);
 create table movimientos(id uuid primary key default gen_random_uuid(),motivo text);
 create table auditoria(id uuid primary key default gen_random_uuid(),tabla text,operacion text,datos jsonb);
 create function private.registrar_auditoria() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.auditoria(tabla,operacion,datos) values (TG_TABLE_NAME,TG_OP,case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end);return null;end;$$;
 select set_config('test.uid','${usuario}',false);select set_config('test.role','admin',false);`)
 const antes=(await db.query('select to_jsonb(e) as fila from equipos e')).rows
 await db.exec(migration);await db.exec(migration)
 const rpc=(areas,anteriores)=>db.query('select configurar_areas_equipo($1,$2::uuid[],$3::uuid[])',[equipo,areas,anteriores])
 await t.test('asigna varias áreas, incluidas heredadas, sin mover ni duplicar equipos',async()=>{
  await rpc([marketing,contabilidad,contabilidad,heredada],[])
  assert.equal((await db.query('select * from equipo_areas_usuarias')).rows.length,3)
  assert.deepEqual((await db.query('select to_jsonb(e) as fila from equipos e')).rows,antes)
  assert.equal((await db.query('select * from movimientos')).rows.length,0)
  assert.equal((await db.query('select * from auditoria')).rows.length,3)
 })
 await t.test('rechaza aula/laboratorio, áreas inactivas e inexistentes sin escrituras parciales',async()=>{
  for(const area of [lab,inactiva,'88888888-8888-4888-8888-888888888888'])
   await assert.rejects(rpc([marketing,area],[marketing,contabilidad,heredada]),/activas y válidas/)
  assert.equal((await db.query('select * from equipo_areas_usuarias')).rows.length,3)
 })
 await t.test('detecta actualización concurrente y conserva la última configuración',async()=>{
  await assert.rejects(rpc([marketing],[]),/Otra persona/)
  assert.equal((await db.query('select * from equipo_areas_usuarias')).rows.length,3)
 })
 await t.test('consulta y anónimo no pueden configurar; técnico sí',async()=>{
  await db.exec("select set_config('test.role','consulta',false)")
  await assert.rejects(rpc([],[marketing,contabilidad,heredada]),/permiso/)
  await db.exec("select set_config('test.uid','',false)")
  await assert.rejects(rpc([],[marketing,contabilidad,heredada]),/permiso/)
  await db.exec(`select set_config('test.uid','${usuario}',false);select set_config('test.role','tecnico',false)`)
  await rpc([marketing,contabilidad],[marketing,contabilidad,heredada])
 })
 await t.test('RLS permite lectura autorizada; impide escritura directa y oculta a perfiles ajenos',async()=>{
  await db.exec('grant usage on schema private,auth to authenticated;grant select on equipos to authenticated;set role authenticated')
  assert.equal((await db.query('select * from equipo_areas_usuarias')).rows.length,2)
  await assert.rejects(db.exec('delete from equipo_areas_usuarias'),/permission denied/)
  await db.exec("select set_config('test.role','ajeno',false)")
  assert.equal((await db.query('select * from equipo_areas_usuarias')).rows.length,0)
  await db.exec("reset role;select set_config('test.role','admin',false)")
 })
 await t.test('un fallo al insertar revierte también retiros y auditoría de la misma operación',async()=>{
  await db.exec(`create function private.fallar_vinculo() returns trigger language plpgsql as $$begin raise exception 'fallo simulado';end;$$;create trigger fallo_prueba before insert on equipo_areas_usuarias for each row execute function private.fallar_vinculo()`)
  const antesAuditoria=(await db.query('select count(*)::int as n from auditoria')).rows[0].n
  await assert.rejects(rpc([marketing,heredada],[marketing,contabilidad]),/fallo simulado/)
  assert.deepEqual((await db.query('select ambiente_id from equipo_areas_usuarias order by ambiente_id')).rows.map((a)=>a.ambiente_id),[marketing,contabilidad].sort())
  assert.equal((await db.query('select count(*)::int as n from auditoria')).rows[0].n,antesAuditoria)
  await db.exec('drop trigger fallo_prueba on equipo_areas_usuarias;drop function private.fallar_vinculo()')
 })
 await t.test('equipo de baja o eliminado no admite configuración',async()=>{
  await db.exec(`update equipos set situacion='baja' where id='${equipo}'`)
  await assert.rejects(rpc([],[marketing,contabilidad]),/activos/)
  await db.exec(`update equipos set situacion='activo',deleted_at=now() where id='${equipo}'`)
  await assert.rejects(rpc([],[marketing,contabilidad]),/activos/)
  await db.exec(`update equipos set deleted_at=null where id='${equipo}'`)
 })
 await t.test('revoca áreas sin traslado y conserva auditoría de cambios',async()=>{
  await rpc([],[marketing,contabilidad])
  assert.equal((await db.query('select * from equipo_areas_usuarias')).rows.length,0)
  assert.deepEqual((await db.query('select to_jsonb(e) as fila from equipos e')).rows,antes)
  assert.equal((await db.query("select * from auditoria where operacion='DELETE'")).rows.length,3)
 })
 } finally {await db.close()}
})
