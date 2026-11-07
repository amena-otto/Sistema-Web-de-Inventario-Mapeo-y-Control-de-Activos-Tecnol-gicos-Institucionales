import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'

// Requiere una copia de inventory_restore llamada inventory_concurrency.
assert.equal(process.env.PGHOST, '127.0.0.1')
assert.equal(process.env.PGDATABASE, 'inventory_concurrency')
const psql = process.env.PSQL_BIN ?? 'psql'
const id = randomUUID()
const run = (sql) => {
  const result = spawnSync(psql, ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}
const concurrent = (sql) => new Promise((resolve, reject) => {
  const child = spawn(psql, ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql])
  let output = '', error = ''
  child.stdout.on('data', (data) => { output += data })
  child.stderr.on('data', (data) => { error += data })
  child.on('error', reject)
  child.on('close', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error)))
})

run(`begin;
  select set_config('request.jwt.claim.sub', (select id::text from public.profiles where rol='admin' and activo limit 1), true);
  insert into public.equipos (id, categoria_id, nombre, situacion, deleted_at)
    values ('${id}', (select id from public.categorias_equipos limit 1), 'PRUEBA CONCURRENCIA', 'baja', now());
  commit;`)
const codigo = run(`select codigo_institucional from public.equipos where id='${id}'`)
assert.match(codigo, /^[A-Z0-9-]+$/)
const rpc = `select public.eliminar_equipo_dado_de_baja('${id}', '${codigo}',
  (select id from public.profiles where rol='admin' and activo limit 1));`
await Promise.all([
  concurrent(`begin; ${rpc} select pg_sleep(1); commit;`),
  concurrent(rpc),
])
assert.equal(run(`select count(*) from public.equipos_eliminados where equipo_id='${id}'`), '1')
assert.equal(run(`select count(*) from public.eliminaciones_pendientes where equipo_id='${id}'`), '1')
const claim = () => concurrent(`select public.reclamar_limpieza_equipo('${id}', '${randomUUID()}')`)
assert.deepEqual((await Promise.all([claim(), claim()])).sort(), ['f', 't'])
console.log('PASS: dos conexiones PostgreSQL, una constancia, un manifiesto y un solo trabajador de limpieza.')
