import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { esOficina, nombreUbicacion, sugerirIcono, iconoCategoria } from '../src/utils/ubicaciones.ts'
import { prepararFilaImportacion } from '../src/utils/inventario.ts'

test('oficinas heredadas: presentación sin modificar la jerarquía ni el código originales', () => {
  const a = { id: 'admisión', nombre: 'ADMISIÓN', tipo: 'aula', codigo: 'ADM-01', pabellon: 'AREAS', piso: '1' }
  const copia = structuredClone(a)
  assert.equal(esOficina(a), true)
  assert.equal(nombreUbicacion(a), 'Áreas académicas / ADMISIÓN')
  assert.deepEqual(a, copia)
  assert.equal(nombreUbicacion({ nombre: 'Laboratorio 1', codigo: 'LAB-1', pabellon: 'D', piso: 'Piso 1', tipo: 'laboratorio' }), 'D / Piso 1 / LAB-1 — Laboratorio 1')
  assert.equal(sugerirIcono('Área Contable', 'oficina'), 'contabilidad')
  assert.equal(sugerirIcono('Servicios Tecnológicos'), 'tecnologia')
  assert.equal(iconoCategoria('Impresora'), 'impresora')
})

test('CSV admite oficinas por nombre y mantiene códigos anteriores; rechaza ambigüedad', () => {
  const fila = { nombre: 'PC', numero_serie: 'ABC', categoria: 'Computadora', ambiente_codigo: 'AREA CONTABLE', estado_operativo: 'operativo' }
  const catalogos = { categorias: [{ id: 'cat', nombre: 'Computadora' }], ambientes: [{ id: 'of', codigo: '', nombre: 'ÁREA CONTABLE', tipo: 'oficina' }, { id: 'lab', codigo: 'LAB-1', nombre: 'Laboratorio', tipo: 'laboratorio' }] }
  assert.equal(prepararFilaImportacion(fila, catalogos).ambiente_id, 'of')
  assert.equal(prepararFilaImportacion({ ...fila, ambiente_codigo: 'LAB-1' }, catalogos).ambiente_id, 'lab')
  assert.throws(() => prepararFilaImportacion(fila, { ...catalogos, ambientes: [...catalogos.ambientes, { id: 'otro', codigo: '', nombre: 'AREA CONTABLE', tipo: 'oficina' }] }), /ambiguo/)
})

test('migración conserva registros y referencias, permite oficinas independientes y exige piso/código para aulas', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create table ambientes (id text primary key, piso_id text not null, codigo text not null, nombre text, tipo text, activo boolean);
      create table equipos (id text primary key, ambiente_id text references ambientes(id));
      insert into ambientes values ('of','piso-heredado','ADM-01','ADMISIÓN','oficina',true), ('lab','piso-d','LAB-1','Laboratorio 1','laboratorio',true);
      insert into equipos values ('pc','of');`)
    const antes = (await db.query('select row_to_json(a) as fila from ambientes a order by id')).rows
    const equiposAntes = (await db.query('select * from equipos')).rows
    const sql = readFileSync(new URL('../supabase/migrations/019_oficinas_independientes.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    const despues = (await db.query('select row_to_json(a) as fila from ambientes a order by id')).rows.map(({ fila: { icono, ...fila } }) => ({ fila }))
    assert.deepEqual(despues, antes)
    assert.deepEqual((await db.query('select * from equipos')).rows, equiposAntes)
    await db.exec("insert into ambientes (id,nombre,tipo,activo) values ('nueva','MARKETING','oficina',true)")
    assert.equal((await db.query("select piso_id,codigo from ambientes where id='nueva'")).rows[0].piso_id, null)
    await assert.rejects(db.exec("insert into ambientes (id,nombre,tipo) values ('aula','Aula','aula')"), /ambientes_ubicacion_por_tipo/)
    await assert.rejects(db.exec("update ambientes set icono='inexistente' where id='nueva'"), /ambientes_icono_valido/)
  } finally { await db.close() }
})
