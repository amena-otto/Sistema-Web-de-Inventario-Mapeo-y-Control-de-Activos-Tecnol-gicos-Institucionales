import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { webcrypto } from 'node:crypto'
import { dividirEnLotes } from '../supabase/functions/_shared/lotes.ts'
import { estadoLimpiezaDesdePendiente, quitarArchivos, resumirLimpieza } from '../supabase/functions/_shared/eliminacion.ts'

const ID = '22222222-2222-4222-8222-222222222222'
const ACTOR = '11111111-1111-4111-8111-111111111111'
const source = readFileSync(new URL('../supabase/functions/admin-eliminar-equipo/index.ts', import.meta.url), 'utf8')
  .replace(/import[\s\S]*?from '[^']+'\r?\n/g, '')
const compiled = stripTypeScriptTypes(source, { mode: 'transform', disableExperimentalWarning: true })

function escenario(options = {}) {
  const state = {
    equipo: { id: ID, codigo_institucional: 'OT-001', situacion: 'baja' },
    constancia: null,
    pendiente: null,
    storage: [], drive: [], eventos: [], locked: false,
    ...options,
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: ACTOR } }, error: null }) },
    storage: { from: () => ({ remove: async (files) => {
      state.eventos.push('storage')
      assert.ok(state.constancia, 'must commit SQL before touching storage')
      if (state.storageError) return { error: { message: 'Storage unavailable' } }
      state.storage.push(...files)
      return { error: null }
    } }) },
    rpc: async (name, args) => {
      if (name === 'reclamar_limpieza_equipo') {
        if (state.locked) return { data: false, error: null }
        state.locked = true
        state.pendiente.bloqueo_token = args.p_token
        return { data: true, error: null }
      }
      state.eventos.push('sql')
      if (state.sqlError) return { error: { message: 'SQL failed' } }
      state.constancia = { equipo_id: ID, codigo_institucional: 'OT-001' }
      state.equipo = null
      state.pendiente = {
        rutas_storage: [...(state.rutas ?? ['a.jpg'])],
        drive_file_ids: [...(state.ids ?? ['drive-file-00001'])],
        storage_limpiado: false, drive_limpiado: false,
      }
      return { error: state.lostResponse ? { message: 'HTTP response lost' } : null }
    },
    from: (table) => {
      let action = 'select', values, filters = []
      const query = {
        select: () => query,
        eq: (key, value) => { filters.push([key, value]); return query },
        in: () => query, limit: () => query, order: () => query,
        update: (v) => { action = 'update'; values = v; return query },
        delete: () => { action = 'delete'; return query },
        maybeSingle: () => query,
        then: (resolve, reject) => Promise.resolve().then(() => {
          if (table === 'profiles') return { data: { rol: state.role ?? 'admin', activo: true }, error: null }
          if (table === 'equipos') return { data: state.equipo, error: null }
          if (table === 'equipos_eliminados') return { data: state.constancia, error: null }
          if (table === 'fotografias_equipos') return { data: state.references ? [{ id: 'active-photo' }] : [], error: null }
          if (table === 'eliminaciones_pendientes') {
            if (action !== 'select' && state.pendiente && filters.every(([k, v]) => k === 'equipo_id' || state.pendiente[k] === v)) {
              if (action === 'delete') state.pendiente = null
              else {
                if (state.checkpointError && !('bloqueo_token' in values)) return { error: { message: 'checkpoint failed' } }
                Object.assign(state.pendiente, values)
                if ('bloqueo_token' in values && values.bloqueo_token === null) state.locked = false
              }
            }
            return { data: state.pendiente, error: null }
          }
          throw new Error(`Unexpected table ${table}`)
        }).then(resolve, reject),
      }
      return query
    },
  }
  let handler
  const deno = { env: { get: () => 'configured' }, serve: (fn) => { handler = fn } }
  const fetchMock = async (_url, init) => {
    assert.ok(state.constancia)
    state.eventos.push('drive')
    if (state.networkError) throw new TypeError('network failure')
    if (state.driveError) return new Response('Drive unavailable', { status: 503 })
    state.drive.push(...JSON.parse(init.body).driveFileIds)
    return new Response('{}')
  }
  new Function('createClient', 'dividirEnLotes', 'estadoLimpiezaDesdePendiente', 'quitarArchivos', 'resumirLimpieza', 'Deno', 'fetch', 'crypto', compiled)(
    () => client, dividirEnLotes, estadoLimpiezaDesdePendiente, quitarArchivos, resumirLimpieza, deno, fetchMock, webcrypto,
  )
  const solicitar = async (body = { equipoId: ID, codigoInstitucional: 'OT-001' }) => {
    const response = await handler(new Request('https://local/delete', {
      method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify(body),
    }))
    return { status: response.status, body: await response.json() }
  }
  return { state, solicitar }
}

test('handler confirms SQL before file cleanup and retries idempotently', async () => {
  const { state, solicitar } = escenario()
  const first = await solicitar()
  assert.equal(first.status, 200)
  assert.equal(first.body.limpiezaCompleta, true)
  assert.deepEqual(state.eventos, ['sql', 'storage', 'drive'])
  assert.equal(state.pendiente, null)
  assert.equal((await solicitar()).body.reintento, true)
  assert.deepEqual(state.eventos, ['sql', 'storage', 'drive'])
})

test('handler SQL failure preserves files', async () => {
  const { state, solicitar } = escenario({ sqlError: true })
  assert.equal((await solicitar()).status, 409)
  assert.deepEqual(state.eventos, ['sql'])
  assert.ok(state.equipo)
})

for (const failure of ['storageError', 'driveError', 'networkError', 'checkpointError']) {
  test(`handler preserves durable progress and recovers ${failure}`, async () => {
    const { state, solicitar } = escenario({ [failure]: true })
    const result = await solicitar()
    assert.equal(result.status, 200)
    assert.equal(result.body.limpiezaCompleta, false)
    assert.ok(state.pendiente)
    state[failure] = false
    assert.equal((await solicitar()).body.limpiezaCompleta, true)
    assert.equal(state.pendiente, null)
  })
}

test('handler recovers a lost successful SQL response', async () => {
  const { state, solicitar } = escenario({ lostResponse: true })
  assert.equal((await solicitar()).body.limpiezaCompleta, true)
  assert.equal(state.equipo, null)
})

test('handler bounds cleanup work, processes over 100 photos across retries', async () => {
  const ids = Array.from({ length: 151 }, (_, i) => `drive-file-${String(i).padStart(5, '0')}`)
  const { state, solicitar } = escenario({ ids, rutas: [] })
  assert.equal((await solicitar()).body.archivosPendientes.drive, 51)
  assert.equal(state.drive.length, 100)
  assert.equal((await solicitar()).body.limpiezaCompleta, true)
  assert.deepEqual(state.drive, ids)
})

test('handler rejects non-admin users without SQL or external side effects', async () => {
  const { state, solicitar } = escenario({ role: 'tecnico' })
  assert.equal((await solicitar()).status, 403)
  assert.deepEqual(state.eventos, [])
})

test('handler protects storage paths still referenced by active equipment', async () => {
  const { state, solicitar } = escenario({ references: true })
  assert.equal((await solicitar()).body.limpiezaCompleta, false)
  assert.deepEqual(state.storage, [])
  assert.deepEqual(state.drive, [])
})

test('handler prevents a second worker from cleaning a claimed operation', async () => {
  const { state, solicitar } = escenario({ driveError: true })
  await solicitar()
  const previous = state.eventos.length
  state.locked = true
  assert.equal((await solicitar()).body.limpiezaCompleta, false)
  assert.equal(state.eventos.length, previous)
})
