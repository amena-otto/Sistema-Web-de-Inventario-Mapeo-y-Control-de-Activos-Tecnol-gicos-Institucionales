import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { normalizarListaArchivos } from '../supabase/functions/_shared/eliminacion.ts'
const ID = '22222222-2222-4222-8222-222222222222'
const FILE = 'drive-file-00001'
const source = readFileSync(new URL('../supabase/functions/fotografias-drive/index.ts', import.meta.url), 'utf8')
  .replace(/import[^\n]*from '[^']+'\r?\n/g, '')
const compiled = stripTypeScriptTypes(source, { mode: 'transform' })
function preparar(options = {}) {
  const state = { receipt: { equipo_id: ID }, equipo: null, pending: { drive_file_ids: [FILE] }, references: [], ...options }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: ID } }, error: null }) },
    from: (table) => {
      const query = {
        select: () => query, eq: () => query, in: () => query, limit: () => query, maybeSingle: () => query,
        then: (resolve, reject) => Promise.resolve({ error: null, data:
          table === 'profiles' ? { rol: state.role ?? 'admin', activo: state.active ?? true } :
          table === 'equipos_eliminados' ? state.receipt : table === 'equipos' ? state.equipo :
          table === 'eliminaciones_pendientes' ? state.pending : state.references,
        }).then(resolve, reject),
      }
      return query
    },
  }
  let handler
  const funcs = new Function('createClient', 'normalizarListaArchivos', 'Deno', 'fetch', compiled + '\nreturn { borrarArchivoDrive };')(
    () => client, normalizarListaArchivos,
    { env: { get: () => 'configured' }, serve: (fn) => { handler = fn } },
    () => { throw new Error('Unauthorized external request') },
  )
  return { client, funcs, call: (ids = [FILE]) => handler(new Request('https://local/photos', {
    method: 'DELETE', headers: { Authorization: 'Bearer test', 'x-operacion': 'limpiar-equipo' },
    body: JSON.stringify({ equipoId: ID, driveFileIds: ids }),
  })) }
}
for (const [name, options, status] of [
  ['uncommitted deletion', { receipt: null }, 409],
  ['equipment still present', { equipo: { id: ID } }, 409],
  ['missing durable manifest', { pending: null }, 409],
  ['file referenced by active equipment', { references: [{ id: 'active' }] }, 409],
  ['non-admin', { role: 'tecnico' }, 403],
  ['inactive admin', { active: false }, 403],
]) {
  test(`Drive blocks ${name} before any external call`, async () => {
    assert.equal((await preparar(options).call()).status, status)
  })
}
test('Drive rejects files absent from the server manifest', async () => {
  assert.equal((await preparar().call(['forged-file-12345'])).status, 400)
})
test('upload compensation preserves files already referenced in PostgreSQL', async () => {
  const { client, funcs } = preparar({ references: [{ id: 'photo' }] })
  await assert.rejects(funcs.borrarArchivoDrive(client, 'token', FILE), /vinculado/)
})
