import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const raiz = new URL('../', import.meta.url)
const leerMigracion = (archivo) =>
  readFileSync(new URL(`supabase/migrations/${archivo}`, raiz), 'utf8')

const ADMIN = '11111111-1111-4111-8111-111111111111'
const TECNICO = '44444444-4444-4444-8444-444444444444'
const EQUIPO = '22222222-2222-4222-8222-222222222222'
const RELACIONADO = '33333333-3333-4333-8333-333333333333'
const EQUIPO_FALLIDO = '55555555-5555-4555-8555-555555555555'

const triggersEsperados = [
  'asignar_actor',
  'asignar_codigo_equipo',
  'auditoria_equipos',
  'proteger_equipos',
  'set_updated_at',
  'validar_cambio_asignacion_equipo',
]

async function crearEsquemaBase(db) {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;

    create schema if not exists private;
    create schema if not exists auth;

    create or replace function private.tiene_rol(roles text[])
    returns boolean
    language sql
    stable
    as $$ select true $$;

    create table public.profiles (
      id uuid primary key default gen_random_uuid(),
      rol text not null default 'admin',
      activo boolean not null default true
    );

    create table public.equipos (
      id uuid primary key default gen_random_uuid(),
      codigo_institucional text not null unique,
      nombre text not null,
      situacion text not null default 'activo',
      estado_operativo text not null default 'operativo',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table public.relaciones_equipos (
      id uuid primary key default gen_random_uuid(),
      equipo_principal_id uuid not null references public.equipos(id),
      equipo_relacionado_id uuid not null references public.equipos(id)
    );

    create table public.componentes (
      id uuid primary key default gen_random_uuid(),
      equipo_id uuid not null references public.equipos(id)
    );

    create table public.fotografias_equipos (
      id uuid primary key default gen_random_uuid(),
      equipo_id uuid not null references public.equipos(id),
      ruta_storage text,
      drive_file_id text,
      created_at timestamptz not null default now()
    );

    create table public.mantenimientos (
      id uuid primary key default gen_random_uuid(),
      equipo_id uuid not null references public.equipos(id)
    );

    create table public.mantenimiento_cambios_estado (
      id uuid primary key default gen_random_uuid(),
      equipo_id uuid not null,
      mantenimiento_id uuid
    );

    create table public.movimientos (
      id uuid primary key default gen_random_uuid(),
      equipo_id uuid not null references public.equipos(id)
    );

    create table public.auditoria (
      id bigserial primary key,
      equipo_id uuid,
      accion text
    );

    create or replace function private.disparador_prueba()
    returns trigger
    language plpgsql
    as $$
    begin
      return coalesce(new, old);
    end;
    $$;

    create trigger asignar_actor
      before insert or update on public.equipos
      for each row execute function private.disparador_prueba();
    create trigger asignar_codigo_equipo
      before insert on public.equipos
      for each row execute function private.disparador_prueba();
    create trigger auditoria_equipos
      after insert or update or delete on public.equipos
      for each row execute function private.disparador_prueba();
    create trigger proteger_equipos
      before delete on public.equipos
      for each row execute function private.disparador_prueba();
    create trigger set_updated_at
      before update on public.equipos
      for each row execute function private.disparador_prueba();
    create trigger validar_cambio_asignacion_equipo
      before update on public.equipos
      for each row execute function private.disparador_prueba();
  `)
}

async function insertarEquipoFallido(db) {
  await db.query(
    `insert into public.equipos (id, codigo_institucional, nombre, situacion)
     values ($1, 'OT-EQP-000003', 'Equipo que no debe borrarse', 'baja')`,
    [EQUIPO_FALLIDO],
  )
}

test('migraciones 015 y 016: idempotencia, triggers y RPC de eliminación', async (t) => {
  const db = new PGlite()

  try {
    await crearEsquemaBase(db)
    await db.exec(leerMigracion('011_eliminar_equipos_dados_de_baja.sql'))
    await db.exec(leerMigracion('015_corregir_eliminacion_definitiva_equipos.sql'))
    await db.exec(leerMigracion('015_corregir_eliminacion_definitiva_equipos.sql'))
    await db.exec(leerMigracion('016_limpieza_diferida_eliminacion_equipos.sql'))
    await db.exec(leerMigracion('016_limpieza_diferida_eliminacion_equipos.sql'))

    await t.test('015 no recrea marcadores_mapa y es idempotente', async () => {
      const resultado = await db.query(
        "select to_regclass('public.marcadores_mapa') as tabla",
      )
      assert.equal(resultado.rows[0].tabla, null)
    })

    await t.test('015 conserva los seis triggers legítimos de equipos', async () => {
      const resultado = await db.query(`
        select tgname
        from pg_trigger
        where tgrelid = 'public.equipos'::regclass
          and not tgisinternal
        order by tgname
      `)
      const nombres = resultado.rows.map((fila) => fila.tgname)
      assert.deepEqual(nombres, triggersEsperados)
    })

    await t.test('015 respeta el trigger y la función si marcadores_mapa existe', async () => {
      await db.exec(`
        create table public.marcadores_mapa (equipo_id uuid);
        create function private.limpiar_marcador_al_mover_equipo()
        returns trigger language plpgsql as $$
        begin
          return coalesce(new, old);
        end;
        $$;
        create trigger limpiar_marcador_al_mover_equipo
          after update on public.equipos
          for each row execute function private.limpiar_marcador_al_mover_equipo();
      `)

      await db.exec(leerMigracion('015_corregir_eliminacion_definitiva_equipos.sql'))

      const trigger = await db.query(`
        select 1
        from pg_trigger
        where tgrelid = 'public.equipos'::regclass
          and tgname = 'limpiar_marcador_al_mover_equipo'
      `)
      const funcion = await db.query(`
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private'
          and p.proname = 'limpiar_marcador_al_mover_equipo'
      `)
      assert.equal(trigger.rows.length, 1)
      assert.equal(funcion.rows.length, 1)

      await db.exec(`
        drop trigger limpiar_marcador_al_mover_equipo on public.equipos;
        drop function private.limpiar_marcador_al_mover_equipo();
        drop table public.marcadores_mapa;
      `)
    })

    await t.test('016 crea la tabla con RLS y permisos solo para service_role', async () => {
      const columnas = await db.query(`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'eliminaciones_pendientes'
        order by ordinal_position
      `)
      assert.deepEqual(
        columnas.rows.map((fila) => fila.column_name),
        [
          'equipo_id',
          'codigo_institucional',
          'rutas_storage',
          'drive_file_ids',
          'storage_limpiado',
          'drive_limpiado',
          'creado_por',
          'creado_at',
          'actualizado_at',
        ],
      )

      const rls = await db.query(`
        select relrowsecurity
        from pg_class
        where oid = 'public.eliminaciones_pendientes'::regclass
      `)
      assert.equal(rls.rows[0].relrowsecurity, true)

      const permisos = await db.query(`
        select
          has_table_privilege('authenticated', 'public.eliminaciones_pendientes', 'select') as cliente,
          has_table_privilege('service_role', 'public.eliminaciones_pendientes', 'select') as servicio
      `)
      assert.equal(permisos.rows[0].cliente, false)
      assert.equal(permisos.rows[0].servicio, true)
    })

    await t.test('016 permite registrar y reanudar la limpieza pendiente', async () => {
      await db.query(
        `insert into public.eliminaciones_pendientes (
           equipo_id, codigo_institucional, rutas_storage, drive_file_ids
         ) values ($1, 'OT-EQP-000001', array['equipos/a.jpg']::text[], array['drive-1', 'drive-2']::text[])`,
        [EQUIPO],
      )

      const inicial = await db.query(
        `select rutas_storage, drive_file_ids, storage_limpiado, drive_limpiado
         from public.eliminaciones_pendientes where equipo_id = $1`,
        [EQUIPO],
      )
      assert.deepEqual(inicial.rows[0].rutas_storage, ['equipos/a.jpg'])
      assert.deepEqual(inicial.rows[0].drive_file_ids, ['drive-1', 'drive-2'])
      assert.equal(inicial.rows[0].storage_limpiado, false)
      assert.equal(inicial.rows[0].drive_limpiado, false)

      await db.query(
        `update public.eliminaciones_pendientes
         set drive_file_ids = array['drive-2']::text[]
         where equipo_id = $1`,
        [EQUIPO],
      )
      await db.query(
        `insert into public.eliminaciones_pendientes (
           equipo_id, codigo_institucional, rutas_storage, drive_file_ids
         ) values ($1, 'OT-EQP-000001', '{}'::text[], '{}'::text[])
         on conflict (equipo_id) do update
           set rutas_storage = excluded.rutas_storage,
               drive_file_ids = excluded.drive_file_ids,
               storage_limpiado = true,
               drive_limpiado = true
           returning equipo_id`,
        [EQUIPO],
      )
      const final = await db.query(
        `select storage_limpiado, drive_limpiado, cardinality(drive_file_ids) as pendientes
         from public.eliminaciones_pendientes where equipo_id = $1`,
        [EQUIPO],
      )
      assert.equal(final.rows[0].storage_limpiado, true)
      assert.equal(final.rows[0].drive_limpiado, true)
      assert.equal(final.rows[0].pendientes, 0)
    })

    await db.exec(leerMigracion('017_eliminacion_atomica_y_bloqueo_limpieza.sql'))
    await db.exec(leerMigracion('017_eliminacion_atomica_y_bloqueo_limpieza.sql'))

    await t.test('017 blocks cleanup before commit', async () => {
      await assert.rejects(db.query('select public.reclamar_limpieza_equipo($1, $2)',
        [EQUIPO, ADMIN]), /confirmada/)
    })

    await t.test('la RPC elimina el equipo, su historial operativo y conserva la auditoría', async () => {
      await db.query(
        `insert into public.profiles (id, rol, activo)
         values ($1, 'admin', true), ($2, 'tecnico', true)`,
        [ADMIN, TECNICO],
      )
      await db.query(
        `insert into public.equipos (id, codigo_institucional, nombre, situacion)
         values ($1, 'OT-EQP-000001', 'Equipo de prueba', 'baja'),
                ($2, 'OT-EQP-000002', 'Equipo relacionado', 'activo')`,
        [EQUIPO, RELACIONADO],
      )
      await db.query(
        `insert into public.relaciones_equipos (equipo_principal_id, equipo_relacionado_id)
         values ($1, $2)`,
        [EQUIPO, RELACIONADO],
      )
      await db.query(
        'insert into public.componentes (equipo_id) values ($1)',
        [EQUIPO],
      )
      await db.query(
        `insert into public.fotografias_equipos (equipo_id, ruta_storage, drive_file_id)
         values ($1, 'equipos/a.jpg', null), ($1, null, 'drive-1')`,
        [EQUIPO],
      )
      await db.query(
        'insert into public.mantenimientos (equipo_id) values ($1)',
        [EQUIPO],
      )
      await db.query(
        'insert into public.mantenimiento_cambios_estado (equipo_id) values ($1)',
        [EQUIPO],
      )
      await db.query(
        'insert into public.movimientos (equipo_id) values ($1)',
        [EQUIPO],
      )
      await db.query(
        "insert into public.auditoria (equipo_id, accion) values ($1, 'baja')",
        [EQUIPO],
      )

      await db.query(
        'select public.eliminar_equipo_dado_de_baja($1, $2, $3)',
        [EQUIPO, 'OT-EQP-000001', ADMIN],
      )

      const conteos = await db.query(`
        select
          (select count(*)::int from public.equipos where id = $1) as equipos,
          (select count(*)::int from public.relaciones_equipos
             where equipo_principal_id = $1 or equipo_relacionado_id = $1) as relaciones,
          (select count(*)::int from public.componentes where equipo_id = $1) as componentes,
          (select count(*)::int from public.fotografias_equipos where equipo_id = $1) as fotografias,
          (select count(*)::int from public.mantenimientos where equipo_id = $1) as mantenimientos,
          (select count(*)::int from public.mantenimiento_cambios_estado where equipo_id = $1) as cambios,
          (select count(*)::int from public.movimientos where equipo_id = $1) as movimientos,
          (select count(*)::int from public.auditoria where equipo_id = $1) as auditoria,
          (select count(*)::int from public.equipos where id = $2) as relacionado
      `, [EQUIPO, RELACIONADO])

      assert.deepEqual(conteos.rows[0], {
        equipos: 0,
        relaciones: 0,
        componentes: 0,
        fotografias: 0,
        mantenimientos: 0,
        cambios: 0,
        movimientos: 0,
        auditoria: 1,
        relacionado: 1,
      })

      const constancia = await db.query(
        `select codigo_institucional, nombre, fotografias_eliminadas, datos_equipo
         from public.equipos_eliminados where equipo_id = $1`,
        [EQUIPO],
      )
      assert.equal(constancia.rows.length, 1)
      assert.equal(constancia.rows[0].codigo_institucional, 'OT-EQP-000001')
      assert.equal(constancia.rows[0].nombre, 'Equipo de prueba')
      assert.equal(constancia.rows[0].fotografias_eliminadas, 2)
      assert.ok(constancia.rows[0].datos_equipo)
    })

    await t.test('017 stores the exact file manifest in the deletion transaction', async () => {
      const { rows } = await db.query('select * from public.eliminaciones_pendientes where equipo_id = $1', [EQUIPO])
      assert.deepEqual(rows[0].rutas_storage, ['equipos/a.jpg'])
      assert.deepEqual(rows[0].drive_file_ids, ['drive-1'])
      assert.equal(rows[0].creado_por, ADMIN)
      assert.equal(rows[0].storage_limpiado, false)
    })

    await t.test('017 excludes concurrent workers and recovers an expired lease', async () => {
      const claim = () => db.query('select public.reclamar_limpieza_equipo($1, $2) as ok', [EQUIPO, ADMIN])
      assert.equal((await claim()).rows[0].ok, true)
      assert.equal((await claim()).rows[0].ok, false)
      await db.query("update public.eliminaciones_pendientes set bloqueo_hasta = now() - interval '1 second' where equipo_id = $1", [EQUIPO])
      assert.equal((await claim()).rows[0].ok, true)
    })

    await t.test('la RPC es idempotente en el reintento', async () => {
      await db.query(
        'select public.eliminar_equipo_dado_de_baja($1, $2, $3)',
        [EQUIPO, 'OT-EQP-000001', ADMIN],
      )
      const resultado = await db.query(
        'select count(*)::int as n from public.equipos_eliminados where equipo_id = $1',
        [EQUIPO],
      )
      assert.equal(resultado.rows[0].n, 1)
    })

    await t.test('la RPC rechaza un código incorrecto sin borrar el equipo', async () => {
      await insertarEquipoFallido(db)
      await assert.rejects(
        db.query(
          'select public.eliminar_equipo_dado_de_baja($1, $2, $3)',
          [EQUIPO_FALLIDO, 'OT-EQP-999999', ADMIN],
        ),
        /no coincide/i,
      )
      const resultado = await db.query(
        `select
           (select count(*)::int from public.equipos where id = $1) as equipos,
           (select count(*)::int from public.equipos_eliminados where equipo_id = $1) as constancias`,
        [EQUIPO_FALLIDO],
      )
      assert.equal(resultado.rows[0].equipos, 1)
      assert.equal(resultado.rows[0].constancias, 0)
    })

    await t.test('la RPC rechaza a un actor que no es administrador activo', async () => {
      await assert.rejects(
        db.query(
          'select public.eliminar_equipo_dado_de_baja($1, $2, $3)',
          [EQUIPO_FALLIDO, 'OT-EQP-000003', TECNICO],
        ),
        /administrador activo/i,
      )
    })
    await t.test('017 rolls back the manifest, receipt and photos on SQL failure', async () => {
      await db.query("insert into public.fotografias_equipos (equipo_id, ruta_storage) values ($1, 'failed.jpg')", [EQUIPO_FALLIDO])
      await db.exec(`create function private.fallar_borrado() returns trigger language plpgsql as $$
        begin raise exception 'simulated SQL failure'; end; $$;
        create trigger fallo before delete on public.equipos for each row execute function private.fallar_borrado();`)
      await assert.rejects(db.query('select public.eliminar_equipo_dado_de_baja($1, $2, $3)',
        [EQUIPO_FALLIDO, 'OT-EQP-000003', ADMIN]), /simulated SQL failure/)
      const { rows } = await db.query(`select
        (select count(*)::int from public.fotografias_equipos where equipo_id = $1) as photos,
        (select count(*)::int from public.eliminaciones_pendientes where equipo_id = $1) as pending,
        (select count(*)::int from public.equipos_eliminados where equipo_id = $1) as receipts`, [EQUIPO_FALLIDO])
      assert.deepEqual(rows[0], { photos: 1, pending: 0, receipts: 0 })
      await db.exec('drop trigger fallo on public.equipos; drop function private.fallar_borrado();')
    })

    await t.test('017 protects files referenced by another active device', async () => {
      await db.query("insert into public.fotografias_equipos (equipo_id, ruta_storage) values ($1, 'failed.jpg')", [RELACIONADO])
      await assert.rejects(db.query('select public.eliminar_equipo_dado_de_baja($1, $2, $3)',
        [EQUIPO_FALLIDO, 'OT-EQP-000003', ADMIN]), /compartidas/)
    })

    await t.test('017 preserves six triggers, RLS and service-only RPC permissions', async () => {
      const { rows } = await db.query(`select
        (select count(*)::int from pg_trigger where tgrelid = 'public.equipos'::regclass and not tgisinternal) as triggers,
        has_function_privilege('authenticated', 'public.reclamar_limpieza_equipo(uuid,uuid)', 'execute') as client,
        has_function_privilege('service_role', 'public.reclamar_limpieza_equipo(uuid,uuid)', 'execute') as service`)
      assert.deepEqual(rows[0], { triggers: 6, client: false, service: true })
    })
  } finally {
    await db.close()
  }
})
