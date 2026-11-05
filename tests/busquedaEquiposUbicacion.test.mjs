import test from 'node:test'
import assert from 'node:assert/strict'
import { filtrarEquiposUbicacion } from '../src/utils/busquedaEquiposUbicacion.ts'

const equipos = [
  { id: 'uno', codigo_institucional: 'INV-2026-001', nombre: 'Estación Técnica', numero_serie: 'SER-Á01', marca: 'Lénovo', modelo: 'ThinkPad T14', estado_operativo: 'en_almacen', situacion: 'activo', ambiente_id: 'a1' },
  { id: 'dos', codigo_institucional: 'INV-2026-002', nombre: 'Computadora', numero_serie: 'SN002', marca: 'Dell', modelo: 'Optiplex', estado_operativo: 'con_fallas', situacion: 'activo', ambiente_id: 'a2' },
  { id: 'otro-piso', codigo_institucional: 'INV-2026-003', nombre: 'Estación Técnica', numero_serie: 'SN003', marca: 'HP', modelo: null, estado_operativo: 'operativo', situacion: 'activo', ambiente_id: 'a3' },
  { id: 'baja', codigo_institucional: 'INV-2026-004', nombre: 'Computadora antigua', numero_serie: null, marca: null, modelo: null, estado_operativo: 'inoperativo', situacion: 'baja', ambiente_id: 'a1' },
]
const buscar = (texto, ambiente = '', ambientes = ['a1', 'a2']) => filtrarEquiposUbicacion(equipos, texto, ambiente, ambientes).map((e) => e.id)

test('busca exclusivamente equipos del piso actual, sin alterar los registros', () => {
  const antes = structuredClone(equipos)
  assert.deepEqual(buscar(''), ['uno', 'dos'])
  assert.deepEqual(buscar('', 'a1'), ['uno'])
  assert.deepEqual(buscar('', '', ['a3']), ['otro-piso'])
  assert.deepEqual(buscar('', 'a3'), [])
  assert.deepEqual(equipos, antes)
})

for (const termino of ['INV-2026-001', '2026-001', 'técnica', 'ESTACION TECNICA', 'ser-a01', 'LÉNOVO', 'thinkpad', 't14', 'en_almacen', 'en almacen', 'ALMACÉN']) {
  test(`encuentra coincidencias parciales, sin distinguir tildes ni mayúsculas: ${termino}`, () => {
    assert.deepEqual(buscar(termino), ['uno'])
  })
}

test('busca tanto el identificador como la etiqueta visible del estado', () => {
  for (const termino of ['con_fallas', 'con fallas', 'observaciones', 'CON OBSERVACIONES']) assert.deepEqual(buscar(termino), ['dos'])
})

test('respeta el ambiente incluso si hay coincidencias en otros ambientes', () => {
  assert.deepEqual(buscar('INV-2026', 'a1'), ['uno'])
  assert.deepEqual(buscar('SN002', 'a1'), [])
  assert.deepEqual(buscar('SN002', 'a2'), ['dos'])
  assert.deepEqual(buscar('    '), ['uno', 'dos'])
})

test('sin coincidencias devuelve cero filas; admite campos opcionales nulos', () => {
  assert.deepEqual(buscar('no existe'), [])
  assert.deepEqual(buscar('pabellón'), [])
  assert.deepEqual(buscar('SN003', '', ['a3']), ['otro-piso'])
  assert.deepEqual(buscar('HP', '', ['a3']), ['otro-piso'])
  assert.deepEqual(buscar('', '', []), [])
})
