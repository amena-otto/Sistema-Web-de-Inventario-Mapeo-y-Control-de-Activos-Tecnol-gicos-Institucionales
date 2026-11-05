import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cargarEquiposDeAmbientes,
  describirErrorSupabase,
  idsAmbientesDelPiso,
  registrarErrorSupabase,
} from '../src/utils/equiposPiso.ts'

const ambientes = [
  { id: 'amb-1', piso_id: 'piso-1' },
  { id: 'amb-2', piso_id: 'piso-1' },
  { id: 'amb-3', piso_id: 'piso-2' },
]

test('un piso sin ambientes no consulta equipos y devuelve un arreglo vacío', async () => {
  assert.deepEqual(idsAmbientesDelPiso(ambientes, ''), [])
  assert.deepEqual(idsAmbientesDelPiso(ambientes, 'piso-sin-ambientes'), [])

  let consultas = 0
  const resultado = await cargarEquiposDeAmbientes([], async () => {
    consultas += 1
    return { data: [], error: null }
  })

  assert.deepEqual(resultado, [])
  assert.equal(consultas, 0)
})

test('un piso con ambientes pero sin equipos devuelve un arreglo vacío', async () => {
  const ids = idsAmbientesDelPiso(ambientes, 'piso-1')
  assert.deepEqual(ids, ['amb-1', 'amb-2'])

  let idsConsultados = []
  const resultado = await cargarEquiposDeAmbientes(ids, async (recibidos) => {
    idsConsultados = recibidos
    return { data: [], error: null }
  })

  assert.deepEqual(resultado, [])
  assert.deepEqual(idsConsultados, ['amb-1', 'amb-2'])
})

test('los equipos existentes conservan sus campos y su categoría del catálogo', async () => {
  const categorias = new Map([['cat-1', 'Cómputo']])
  const fila = {
    id: 'eq-1',
    codigo_institucional: 'INV-2026-001',
    nombre: 'Computadora de escritorio',
    marca: 'Dell',
    modelo: 'Optiplex 7090',
    numero_serie: 'SN-001',
    estado_operativo: 'operativo',
    situacion: 'activo',
    ambiente_id: 'amb-1',
    categoria_id: 'cat-1',
  }

  const resultado = await cargarEquiposDeAmbientes(
    ['amb-1'],
    async () => ({ data: [fila], error: null }),
    categorias,
  )

  assert.deepEqual(resultado, [
    {
      ...fila,
      categoria: { nombre: 'Cómputo' },
    },
  ])
})

test('un error real del servidor se propaga con code, message, details y hint', async () => {
  const errorServidor = {
    code: 'PGRST200',
    message: 'Could not find a relationship between equipos and ambientes',
    details: 'Searched for a foreign key relationship in the schema cache',
    hint: 'Verify the relationship or remove the embedded resource',
  }

  await assert.rejects(
    () =>
      cargarEquiposDeAmbientes(['amb-1'], async () => ({
        data: null,
        error: errorServidor,
      })),
    (error) => {
      assert.equal(error.code, 'PGRST200')
      assert.equal(error.message, errorServidor.message)
      assert.equal(error.details, errorServidor.details)
      assert.equal(error.hint, errorServidor.hint)
      return true
    },
  )

  const descripcion = describirErrorSupabase(errorServidor)
  assert.match(descripcion, /code: PGRST200/)
  assert.match(descripcion, /message: Could not find a relationship/)
  assert.match(descripcion, /details: Searched for a foreign key relationship/)
  assert.match(descripcion, /hint: Verify the relationship/)

  const llamadas = []
  const errorOriginal = console.error
  console.error = (...argumentos) => llamadas.push(argumentos)
  try {
    registrarErrorSupabase('No se pudieron cargar los equipos del piso', errorServidor)
  } finally {
    console.error = errorOriginal
  }

  assert.equal(llamadas.length, 1)
  assert.match(String(llamadas[0][0]), /No se pudieron cargar los equipos del piso/)
  assert.match(String(llamadas[0][0]), /code: PGRST200/)
  assert.match(String(llamadas[0][0]), /hint: Verify the relationship/)
})
