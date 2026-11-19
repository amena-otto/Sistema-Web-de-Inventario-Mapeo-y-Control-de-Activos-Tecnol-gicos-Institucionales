import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const raiz = new URL('../', import.meta.url)
const leerMigracion = (archivo) =>
  readFileSync(new URL(`supabase/migrations/${archivo}`, raiz), 'utf8')

const ADMIN = '11111111-1111-4111-8111-111111111111'
const TECNICO = '44444444-4444-4444-8444-444444444444'
const OTRO = '55555555-5555-4555-8555-555555555555'
const CONSULTA = '66666666-6666-4666-8666-666666666666'
const EQUIPO = '22222222-2222-4222-8222-222222222222'
const EQUIPO2 = '33333333-3333-4333-8333-333333333333'
const EQUIPO3 = '77777777-7777-4777-8777-777777777777'
const HISTORICO = '99999999-9999-4999-8999-999999999999'
const CAT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PAB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const PISO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const AMB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const AMB2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const FECHA = '2026-11-19'
const SEGUIMIENTO = '2026-12-01T10:00:00Z'

async function crearEsquemaBase(db) {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;

    create schema private;
    create schema auth;

    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('test.uid', true), '')::uuid$$;
    create function private.tiene_rol(roles text[]) returns boolean language sql stable as
      $$select current_setting('test.role', true) = any(roles)$$;

    create table public.profiles (
      id uuid primary key,
      rol text not null default 'tecnico',
      activo boolean not null default true,
      nombres text,
      apellidos text
    );

    create table public.categorias_equipos (id uuid primary key, nombre text);
    create table public.pabellones (id uuid primary key, nombre text);
    create table public.pisos (
      id uuid primary key,
      nombre text,
      pabellon_id uuid references public.pabellones(id)
    );
    create table public.ambientes (
      id uuid primary key,
      nombre text,
      codigo text,
      tipo text,
      piso_id uuid references public.pisos(id)
    );

    create table public.equipos (
      id uuid primary key default gen_random_uuid(),
      codigo_institucional text not null unique,
      nombre text not null,
      numero_serie text,
      marca text,
      modelo text,
      codigo_patrimonial text,
      categoria_id uuid references public.categorias_equipos(id),
      ambiente_id uuid references public.ambientes(id),
      situacion text not null default 'activo',
      estado_operativo text not null default 'operativo',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table public.mantenimientos (
      id uuid primary key default gen_random_uuid(),
      equipo_id uuid not null references public.equipos(id),
      tipo text not null default 'preventivo',
      fecha_mantenimiento date not null default current_date,
      descripcion text,
      problema_reportado text,
      diagnostico text,
      acciones_realizadas text,
      componentes_reemplazados text,
      resultado text,
      observaciones text,
      proxima_revision date,
      estado text not null default 'pendiente',
      responsable_id uuid,
      created_at timestamptz not null default now()
    );

    create table public.mantenimiento_cambios_estado (
      id uuid primary key default gen_random_uuid(),
      mantenimiento_id uuid references public.mantenimientos(id),
      equipo_id uuid not null references public.equipos(id),
      estado_mantenimiento_anterior text,
      estado_mantenimiento_nuevo text,
      estado_equipo_anterior text,
      estado_equipo_nuevo text,
      motivo text,
      usuario_id uuid,
      created_at timestamptz not null default now()
    );

    create table public.auditoria (
      id bigserial primary key,
      tabla text,
      operacion text,
      datos jsonb
    );

    create function private.registrar_auditoria() returns trigger
    language plpgsql security definer set search_path = '' as $$
    begin
      insert into public.auditoria (tabla, operacion, datos)
      values (
        TG_TABLE_NAME,
        TG_OP,
        case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
      );
      return null;
    end; $$;

    insert into public.profiles (id, rol, activo, nombres, apellidos) values
      ('${ADMIN}', 'admin', true, 'Ana', 'Administradora'),
      ('${TECNICO}', 'tecnico', true, 'Tito', 'Técnico'),
      ('${OTRO}', 'tecnico', true, 'Omar', 'Técnico'),
      ('${CONSULTA}', 'consulta', true, 'Carmen', 'Consultora');

    insert into public.categorias_equipos (id, nombre)
      values ('${CAT}', 'Equipos de Cómputo');
    insert into public.pabellones (id, nombre) values ('${PAB}', 'Pabellón Central');
    insert into public.pisos (id, nombre, pabellon_id)
      values ('${PISO}', 'Piso 2', '${PAB}');
    insert into public.ambientes (id, nombre, codigo, tipo, piso_id) values
      ('${AMB}', 'Laboratorio de Redes', 'LAB-1', 'laboratorio', '${PISO}'),
      ('${AMB2}', 'Oficina Administrativa', 'OFI-1', 'oficina', '${PISO}');

    insert into public.equipos (
      id, codigo_institucional, nombre, numero_serie, marca, modelo,
      codigo_patrimonial, categoria_id, ambiente_id, situacion, estado_operativo
    ) values
      ('${EQUIPO}', 'INV-2026-001', 'Laptop Técnica', 'SER-A01', 'Lenovo', 'T14', 'PAT-1', '${CAT}', '${AMB}', 'activo', 'operativo'),
      ('${EQUIPO2}', 'INV-2026-002', 'Proyector', 'SER-B02', 'Epson', 'X01', 'PAT-2', '${CAT}', '${AMB2}', 'activo', 'operativo');

    -- Intervención histórica: los campos nuevos deben quedar nulos.
    insert into public.mantenimientos (
      id, equipo_id, tipo, fecha_mantenimiento, descripcion,
      problema_reportado, estado, created_at
    ) values (
      '${HISTORICO}', '${EQUIPO2}', 'correctivo', '2026-01-10', 'Revisión histórica',
      'Fallo anterior', 'completado', '2026-01-10T08:00:00Z'
    );

    select set_config('test.uid', '${ADMIN}', false);
    select set_config('test.role', 'admin', false);
  `)
}

const activar = (db, uid, rol) =>
  db.exec(
    `select set_config('test.uid', '${uid}', false); select set_config('test.role', '${rol}', false)`,
  )

const alta = (db, equipoId, estado = 'pendiente', responsable = null) =>
  db.query(
    `select public.registrar_mantenimiento(
      $1, 'preventivo', $2, 'Revisión programada', null, null, null, null,
      null, null, $3, null, $4, null
    ) as id`,
    [equipoId, FECHA, estado, responsable],
  )

const inicio = (db, mantenimientoId, observaciones = null) =>
  db.query('select public.iniciar_mantenimiento($1, $2) as id', [
    mantenimientoId,
    observaciones,
  ])

const avance = (db, mantenimientoId, opciones = {}) =>
  db.query(
    `select public.guardar_avance_mantenimiento(
      $1, $2, $3, $4, $5, $6, $7::timestamptz, $8
    ) as id`,
    [
      mantenimientoId,
      opciones.descripcion ?? 'Avance registrado',
      opciones.observaciones ?? null,
      opciones.diagnostico ?? null,
      opciones.acciones ?? null,
      opciones.componentes ?? null,
      opciones.seguimiento ?? null,
      opciones.actualizarSeguimiento ?? false,
    ],
  )

const cierre = (db, mantenimientoId, opciones = {}) =>
  db.query(
    `select public.finalizar_mantenimiento(
      $1, $2, $3, $4, $5, $6, $7, $8::date
    ) as id`,
    [
      mantenimientoId,
      opciones.diagnostico ?? 'Diagnóstico final',
      opciones.acciones ?? 'Acciones finales',
      opciones.resultado ?? 'Resultado final',
      opciones.estadoFinal ?? 'operativo',
      opciones.componentes ?? null,
      opciones.observaciones ?? null,
      opciones.proximaRevision ?? null,
    ],
  )

const buscar = (db, termino, limite = 20, offset = 0) =>
  db.query(
    'select id, codigo_institucional, nombre, numero_serie, categoria_nombre, ubicacion, total from public.buscar_equipos_mantenimiento($1, $2, $3)',
    [termino, limite, offset],
  )

const mantenimiento = (db, id) =>
  db.query(
    `select estado, fecha_mantenimiento, fecha_inicio_real, fecha_finalizacion_real,
            iniciado_por, finalizado_por, estado_operativo_anterior,
            diagnostico, acciones_realizadas, componentes_reemplazados,
            resultado, observaciones, proximo_seguimiento, proxima_revision,
            responsable_id
     from public.mantenimientos where id = $1`,
    [id],
  )

test('migración 021: ciclo automático, búsqueda, protecciones y rollback', async (t) => {
  const db = new PGlite()
  try {
    await crearEsquemaBase(db)
    await db.exec(leerMigracion('021_flujo_mantenimientos_automatico.sql'))
    await db.exec(leerMigracion('021_flujo_mantenimientos_automatico.sql'))

    let mantenimientoId
    let fechaInicioReal

    await t.test('migración idempotente, columnas anulables y objetos de BD', async () => {
      const columnas = await db.query(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'mantenimientos'
           and column_name in (
             'estado_operativo_anterior', 'fecha_inicio_real',
             'fecha_finalizacion_real', 'iniciado_por', 'finalizado_por',
             'proximo_seguimiento'
           )
         order by column_name`,
      )
      assert.deepEqual(
        columnas.rows.map((fila) => fila.column_name),
        [
          'estado_operativo_anterior',
          'fecha_finalizacion_real',
          'fecha_inicio_real',
          'finalizado_por',
          'iniciado_por',
          'proximo_seguimiento',
        ],
      )

      const historico = await mantenimiento(db, HISTORICO)
      assert.equal(historico.rows[0].estado_operativo_anterior, null)
      assert.equal(historico.rows[0].fecha_inicio_real, null)
      assert.equal(historico.rows[0].fecha_finalizacion_real, null)
      assert.equal(historico.rows[0].iniciado_por, null)
      assert.equal(historico.rows[0].finalizado_por, null)
      assert.equal(historico.rows[0].proximo_seguimiento, null)

      const objetos = await db.query(`
        select
          to_regclass('public.mantenimiento_avances') is not null as avances,
          (select relrowsecurity from pg_class
            where oid = 'public.mantenimiento_avances'::regclass) as rls,
          (select count(*)::int from pg_indexes
            where indexname = 'mantenimientos_un_en_proceso_por_equipo_uidx') as unico,
          (select count(*)::int from pg_trigger
            where tgrelid = 'public.mantenimientos'::regclass
              and tgname = 'validar_mantenimiento_en_proceso_unico') as trigger_unico,
          (select count(*)::int from pg_trigger
            where tgrelid = 'public.equipos'::regclass
              and tgname = 'validar_estado_operativo_durante_mantenimiento') as trigger_equipos,
          (select count(*)::int from pg_trigger
            where tgrelid = 'public.mantenimiento_avances'::regclass
              and tgname = 'proteger_mantenimiento_avances') as trigger_inmutabilidad,
          has_function_privilege('authenticated',
            'public.iniciar_mantenimiento(uuid,text)', 'execute') as permiso_iniciar,
          has_function_privilege('anon',
            'public.iniciar_mantenimiento(uuid,text)', 'execute') as anon_iniciar,
          has_table_privilege('authenticated',
            'public.mantenimiento_avances', 'insert') as insert_avances
      `)
      assert.deepEqual(objetos.rows[0], {
        avances: true,
        rls: true,
        unico: 1,
        trigger_unico: 1,
        trigger_equipos: 1,
        trigger_inmutabilidad: 1,
        permiso_iniciar: true,
        anon_iniciar: false,
        insert_avances: false,
      })
    })

    await t.test('el alta siempre queda pendiente y no toca el estado del equipo', async () => {
      const { rows } = await alta(db, EQUIPO, 'pendiente', TECNICO)
      mantenimientoId = rows[0].id
      const fila = await mantenimiento(db, mantenimientoId)
      assert.equal(fila.rows[0].estado, 'pendiente')
      assert.equal(fila.rows[0].fecha_inicio_real, null)
      assert.equal(fila.rows[0].responsable_id, TECNICO)

      const equipo = await db.query(
        'select estado_operativo from public.equipos where id = $1',
        [EQUIPO],
      )
      assert.equal(equipo.rows[0].estado_operativo, 'operativo')

      const cambios = await db.query(
        `select estado_mantenimiento_nuevo, estado_equipo_nuevo, motivo
         from public.mantenimiento_cambios_estado
         where mantenimiento_id = $1`,
        [mantenimientoId],
      )
      assert.equal(cambios.rows.length, 1)
      assert.equal(cambios.rows[0].estado_mantenimiento_nuevo, 'pendiente')
      assert.equal(cambios.rows[0].estado_equipo_nuevo, 'operativo')

      await assert.rejects(alta(db, EQUIPO, 'completado'), /pendiente/)
      await assert.rejects(alta(db, EQUIPO, 'en_proceso'), /pendiente/)
    })

    await t.test('iniciar es atómico: fecha real, usuario, estado previo y auditoría', async () => {
      await activar(db, TECNICO, 'tecnico')
      await inicio(db, mantenimientoId, 'Se inicia revisión')
      const fila = await mantenimiento(db, mantenimientoId)
      assert.equal(fila.rows[0].estado, 'en_proceso')
      assert.equal(fila.rows[0].estado_operativo_anterior, 'operativo')
      assert.equal(fila.rows[0].iniciado_por, TECNICO)
      assert.ok(fila.rows[0].fecha_inicio_real)
      assert.equal(fila.rows[0].fecha_finalizacion_real, null)
      assert.match(fila.rows[0].observaciones, /Inicio: Se inicia revisión/)
      fechaInicioReal = fila.rows[0].fecha_inicio_real

      const equipo = await db.query(
        'select estado_operativo from public.equipos where id = $1',
        [EQUIPO],
      )
      assert.equal(equipo.rows[0].estado_operativo, 'en_mantenimiento')

      const cambio = await db.query(
        `select estado_mantenimiento_anterior, estado_mantenimiento_nuevo,
                estado_equipo_anterior, estado_equipo_nuevo, usuario_id
         from public.mantenimiento_cambios_estado
         where mantenimiento_id = $1 and estado_mantenimiento_nuevo = 'en_proceso'`,
        [mantenimientoId],
      )
      assert.equal(cambio.rows.length, 1)
      assert.deepEqual(cambio.rows[0], {
        estado_mantenimiento_anterior: 'pendiente',
        estado_mantenimiento_nuevo: 'en_proceso',
        estado_equipo_anterior: 'operativo',
        estado_equipo_nuevo: 'en_mantenimiento',
        usuario_id: TECNICO,
      })
    })

    await t.test('bloquea un segundo en_proceso y expone el UUID del bloqueante', async () => {
      const segunda = (await alta(db, EQUIPO, 'pendiente', TECNICO)).rows[0].id
      await assert.rejects(
        inicio(db, segunda),
        (error) => {
          assert.match(error.message, /en_proceso/)
          assert.ok(error.message.includes(mantenimientoId))
          return true
        },
      )
      await assert.rejects(
        db.query(
          `update public.mantenimientos set estado = 'en_proceso' where id = $1`,
          [segunda],
        ),
        /en_proceso/,
      )
      const estados = await db.query(
        `select id, estado from public.mantenimientos
         where equipo_id = $1 order by created_at`,
        [EQUIPO],
      )
      assert.deepEqual(
        estados.rows.map((fila) => fila.estado),
        ['en_proceso', 'pendiente'],
      )
      await assert.rejects(
        avance(db, segunda),
        /en_proceso/,
      )
    })

    await t.test('los avances son cronológicos, inmutables y no reinician la intervención', async () => {
      const totalAntes = await db.query(
        'select count(*)::int as n from public.mantenimientos',
      )
      await avance(db, mantenimientoId, {
        descripcion: 'Primer avance',
        diagnostico: 'Falla en fuente',
        acciones: 'Prueba de fuente',
        componentes: 'Fuente nueva',
        observaciones: 'Sin novedades',
        actualizarSeguimiento: true,
        seguimiento: SEGUIMIENTO,
      })
      await avance(db, mantenimientoId, {
        descripcion: 'Segundo avance',
        observaciones: 'Continúa la intervención',
      })

      const registros = await db.query(
        `select descripcion, registrado_por, fecha_hora, diagnostico,
                acciones_realizadas, componentes_reemplazados, proximo_seguimiento
         from public.mantenimiento_avances
         where mantenimiento_id = $1 order by fecha_hora, descripcion`,
        [mantenimientoId],
      )
      assert.equal(registros.rows.length, 2)
      assert.deepEqual(
        registros.rows.map((fila) => fila.descripcion),
        ['Primer avance', 'Segundo avance'],
      )
      assert.equal(registros.rows[0].registrado_por, TECNICO)
      assert.equal(registros.rows[0].componentes_reemplazados, 'Fuente nueva')

      const fila = await mantenimiento(db, mantenimientoId)
      assert.equal(fila.rows[0].estado, 'en_proceso')
      assert.equal(
        fila.rows[0].fecha_inicio_real.getTime(),
        fechaInicioReal.getTime(),
      )
      assert.equal(fila.rows[0].diagnostico, 'Falla en fuente')
      assert.equal(fila.rows[0].acciones_realizadas, 'Prueba de fuente')
      assert.equal(
        fila.rows[0].proximo_seguimiento.getTime(),
        new Date(SEGUIMIENTO).getTime(),
      )
      assert.equal(fila.rows[0].fecha_finalizacion_real, null)
      assert.equal(
        (await db.query('select count(*)::int as n from public.mantenimientos'))
          .rows[0].n,
        totalAntes.rows[0].n,
      )

      await assert.rejects(
        db.query(
          `update public.mantenimiento_avances set descripcion = 'Editado'
           where mantenimiento_id = $1`,
          [mantenimientoId],
        ),
        /inmutables/,
      )
      await assert.rejects(
        db.query(
          `delete from public.mantenimiento_avances where mantenimiento_id = $1`,
          [mantenimientoId],
        ),
        /inmutables/,
      )
      const auditoria = await db.query(
        `select count(*)::int as n from public.auditoria
         where tabla = 'mantenimiento_avances'`,
      )
      assert.equal(auditoria.rows[0].n, 2)
    })

    await t.test('finalizar exige datos completos y estado final válido', async () => {
      await assert.rejects(
        cierre(db, mantenimientoId, { diagnostico: '   ' }),
        /diagnóstico, acciones realizadas y resultado/,
      )
      await assert.rejects(
        cierre(db, mantenimientoId, { estadoFinal: 'en_almacen' }),
        /estado operativo final válido/,
      )
      await assert.rejects(
        cierre(db, mantenimientoId, { proximaRevision: '2026-01-01' }),
        /no puede ser anterior/,
      )
      const fila = await mantenimiento(db, mantenimientoId)
      assert.equal(fila.rows[0].estado, 'en_proceso')
      assert.equal(fila.rows[0].fecha_finalizacion_real, null)
    })

    await t.test('finalizar registra cierre, transición e historial atómicamente', async () => {
      await cierre(db, mantenimientoId, {
        diagnostico: 'Fuente defectuosa',
        acciones: 'Se reemplaza fuente',
        componentes: 'Fuente 500W',
        resultado: 'Equipo con observaciones',
        estadoFinal: 'con_fallas',
        observaciones: 'Requiere seguimiento',
        proximaRevision: '2026-12-15',
      })
      const fila = await mantenimiento(db, mantenimientoId)
      assert.equal(fila.rows[0].estado, 'completado')
      assert.equal(fila.rows[0].diagnostico, 'Fuente defectuosa')
      assert.equal(fila.rows[0].acciones_realizadas, 'Se reemplaza fuente')
      assert.equal(fila.rows[0].componentes_reemplazados, 'Fuente 500W')
      assert.equal(fila.rows[0].resultado, 'Equipo con observaciones')
      assert.equal(
        fila.rows[0].fecha_inicio_real.getTime(),
        fechaInicioReal.getTime(),
      )
      assert.ok(fila.rows[0].fecha_finalizacion_real)
      assert.equal(fila.rows[0].finalizado_por, TECNICO)
      assert.equal(fila.rows[0].proximo_seguimiento, null)
      assert.equal(
        fila.rows[0].proxima_revision.toISOString().slice(0, 10),
        '2026-12-15',
      )
      assert.match(fila.rows[0].observaciones, /Cierre: Requiere seguimiento/)

      const equipo = await db.query(
        'select estado_operativo from public.equipos where id = $1',
        [EQUIPO],
      )
      assert.equal(equipo.rows[0].estado_operativo, 'con_fallas')

      const cambio = await db.query(
        `select estado_mantenimiento_anterior, estado_mantenimiento_nuevo,
                estado_equipo_anterior, estado_equipo_nuevo, motivo, usuario_id
         from public.mantenimiento_cambios_estado
         where mantenimiento_id = $1 and estado_mantenimiento_nuevo = 'completado'`,
        [mantenimientoId],
      )
      assert.equal(cambio.rows.length, 1)
      assert.equal(cambio.rows[0].estado_mantenimiento_anterior, 'en_proceso')
      assert.equal(cambio.rows[0].estado_equipo_anterior, 'en_mantenimiento')
      assert.equal(cambio.rows[0].estado_equipo_nuevo, 'con_fallas')
      assert.equal(cambio.rows[0].motivo, 'Equipo con observaciones')
      assert.equal(cambio.rows[0].usuario_id, TECNICO)
      assert.equal(
        (await db.query(
          'select count(*)::int as n from public.mantenimiento_avances where mantenimiento_id = $1',
          [mantenimientoId],
        )).rows[0].n,
        2,
      )
    })

    await t.test('búsqueda por nombre, código, serie, categoría y ubicación sin tildes', async () => {
      await activar(db, TECNICO, 'tecnico')
      const casos = [
        ['inv-2026-001', EQUIPO],
        ['2026-001', EQUIPO],
        ['tecnica', EQUIPO],
        ['TECNICA', EQUIPO],
        ['ser-a01', EQUIPO],
        ['computo', EQUIPO],
        ['redes', EQUIPO],
        ['PABELLON', EQUIPO],
        ['proyector', EQUIPO2],
      ]
      for (const [termino, esperado] of casos) {
        const { rows } = await buscar(db, termino)
        assert.ok(
          rows.some((fila) => fila.id === esperado),
          `El término "${termino}" debía encontrar ${esperado}`,
        )
        assert.ok(rows[0].nombre && rows[0].codigo_institucional)
      }

      const sinResultados = await buscar(db, 'no-existe-ninguno')
      assert.equal(sinResultados.rows.length, 0)

      const primera = await buscar(db, '', 1, 0)
      assert.equal(primera.rows.length, 1)
      assert.equal(primera.rows[0].total, 2)
      const segunda = await buscar(db, '', 1, 1)
      assert.equal(segunda.rows.length, 1)
      assert.notEqual(segunda.rows[0].id, primera.rows[0].id)
      assert.equal(segunda.rows[0].total, 2)
      assert.ok(primera.rows[0].numero_serie)
      assert.ok(primera.rows[0].ubicacion)

      await activar(db, CONSULTA, 'consulta')
      await assert.rejects(buscar(db, 'inv'), /permiso/)
      await activar(db, '', 'consulta')
      await assert.rejects(buscar(db, 'inv'), /permiso/)
      await activar(db, TECNICO, 'tecnico')
    })

    await t.test('la búsqueda paginada limita el tamaño de página', async () => {
      await db.exec(`
        insert into public.equipos (
          codigo_institucional, nombre, situacion, estado_operativo
        )
        select 'MAS-' || lpad(i::text, 4, '0'), 'Equipo masivo ' || i,
               'activo', 'operativo'
        from generate_series(1, 101) as i;
      `)
      const pagina = await buscar(db, '', 200, 0)
      assert.equal(pagina.rows.length, 100)
      assert.equal(pagina.rows[0].total, 103)
      const ultima = await buscar(db, '', 200, 100)
      assert.equal(ultima.rows.length, 3)
      assert.equal(ultima.rows[0].total, 103)
    })

    await t.test('protege el estado operativo y permite la excepción administrativa', async () => {
      await activar(db, TECNICO, 'tecnico')
      const id = (await alta(db, EQUIPO2, 'pendiente', TECNICO)).rows[0].id
      await inicio(db, id)

      await assert.rejects(
        db.query(
          `update public.equipos set estado_operativo = 'operativo'
           where id = $1`,
          [EQUIPO2],
        ),
        /mantenimiento en_proceso/,
      )

      await activar(db, '', 'tecnico')
      await db.query(
        `update public.equipos set estado_operativo = 'inoperativo'
         where id = $1`,
        [EQUIPO2],
      )
      assert.equal(
        (await db.query(
          'select estado_operativo from public.equipos where id = $1',
          [EQUIPO2],
        )).rows[0].estado_operativo,
        'inoperativo',
      )

      await activar(db, TECNICO, 'tecnico')
      await assert.rejects(
        db.query(
          'select public.corregir_estado_operativo_en_mantenimiento($1, $2, $3)',
          [EQUIPO2, 'con_fallas', 'Intento de técnico'],
        ),
        /administrador/,
      )
      await activar(db, ADMIN, 'admin')
      await assert.rejects(
        db.query(
          'select public.corregir_estado_operativo_en_mantenimiento($1, $2, $3)',
          [EQUIPO2, 'con_fallas', '   '],
        ),
        /motivo/,
      )
      await db.query(
        'select public.corregir_estado_operativo_en_mantenimiento($1, $2, $3)',
        [EQUIPO2, 'con_fallas', 'Corrección autorizada por incidencia registrada'],
      )
      const cambio = await db.query(
        `select estado_equipo_anterior, estado_equipo_nuevo, motivo, usuario_id
         from public.mantenimiento_cambios_estado
         where equipo_id = $1 and motivo like 'Corrección administrativa:%'
         order by created_at desc limit 1`,
        [EQUIPO2],
      )
      assert.equal(cambio.rows.length, 1)
      assert.equal(cambio.rows[0].estado_equipo_anterior, 'inoperativo')
      assert.equal(cambio.rows[0].estado_equipo_nuevo, 'con_fallas')
      assert.equal(cambio.rows[0].usuario_id, ADMIN)
      assert.match(cambio.rows[0].motivo, /incidencia registrada/)
    })

    await t.test('un fallo revierte todos los cambios de la misma transacción', async () => {
      await activar(db, ADMIN, 'admin')
      await db.exec(`
        create function private.fallar_cambio() returns trigger language plpgsql as $$
        begin raise exception 'fallo simulado'; end; $$;
        create trigger fallo_cambio before insert on public.mantenimiento_cambios_estado
          for each row execute function private.fallar_cambio();
      `)
      const antes = await db.query(`
        select
          (select count(*)::int from public.mantenimientos where equipo_id = '${EQUIPO3}') as mantenimientos,
          (select estado_operativo from public.equipos where id = '${EQUIPO}') as estado_equipo
      `)
      const totals = await db.query(`
        select
          (select count(*)::int from public.mantenimientos) as mantenimientos,
          (select count(*)::int from public.mantenimiento_avances) as avances,
          (select count(*)::int from public.mantenimiento_cambios_estado) as cambios
      `)

      await assert.rejects(
        alta(db, EQUIPO, 'pendiente', ADMIN).catch((error) => {
          if (error.message.includes('equipo no existe')) return error
          return Promise.reject(error)
        }),
        /fallo simulado/,
      )

      await db.exec(`
        insert into public.equipos (id, codigo_institucional, nombre, situacion, estado_operativo)
          values ('${EQUIPO3}', 'INV-2026-003', 'Equipo rollback', 'activo', 'operativo');
      `)
      await assert.rejects(alta(db, EQUIPO3, 'pendiente', ADMIN), /fallo simulado/)

      const despues = await db.query(`
        select
          (select count(*)::int from public.mantenimientos) as mantenimientos,
          (select count(*)::int from public.mantenimiento_avances) as avances,
          (select count(*)::int from public.mantenimiento_cambios_estado) as cambios,
          (select estado_operativo from public.equipos where id = '${EQUIPO}') as estado_equipo
      `)
      assert.deepEqual(despues.rows[0], {
        ...totals.rows[0],
        estado_equipo: antes.rows[0].estado_equipo,
      })
      await db.exec(`
        drop trigger fallo_cambio on public.mantenimiento_cambios_estado;
        drop function private.fallar_cambio();
      `)
    })

    await t.test('RLS permite leer avances autorizados y bloquea escritura directa', async () => {
      await activar(db, ADMIN, 'admin')
      await db.exec(`
        grant usage on schema public, private, auth to authenticated;
        set role authenticated;
      `)
      assert.ok((await db.query('select id from public.mantenimiento_avances')).rows.length > 0)
      await assert.rejects(
        db.query(`delete from public.mantenimiento_avances`),
        /permission denied/,
      )
      await activar(db, ADMIN, 'ajeno')
      assert.equal((await db.query('select id from public.mantenimiento_avances')).rows.length, 0)
      await db.exec('reset role')
    })
  } finally {
    await db.close()
  }
})

test('migración 021 conserva duplicados históricos y no crea el índice único', async () => {
  const db = new PGlite()
  try {
    await crearEsquemaBase(db)
    await db.exec(`
      insert into public.mantenimientos (id, equipo_id, estado, fecha_mantenimiento)
      values
        ('aaaaaaaa-aaaa-4aaa-8aaa-a1a1a1a1a1a1', '${EQUIPO}', 'en_proceso', '2026-01-01'),
        ('bbbbbbbb-bbbb-4bbb-8bbb-b1b1b1b1b1b1', '${EQUIPO}', 'en_proceso', '2026-01-02');
    `)
    await db.exec(leerMigracion('021_flujo_mantenimientos_automatico.sql'))

    const resultado = await db.query(`
      select
        (select count(*)::int from public.mantenimientos where estado = 'en_proceso') as duplicados,
        (select count(*)::int from pg_indexes
          where indexname = 'mantenimientos_un_en_proceso_por_equipo_uidx') as indices
    `)
    assert.deepEqual(resultado.rows[0], { duplicados: 2, indices: 0 })
  } finally {
    await db.close()
  }
})
