import test from 'node:test'
import assert from 'node:assert/strict'
import {
  contarFiltrosActivos,
  idsAmbientesDeSeleccion,
  opcionesAmbiente,
  opcionesPabellon,
  opcionesPiso,
  resolverSeleccionUbicacion,
} from '../src/utils/filtrosEquipos.ts'

const ambientes = [
  { id: 'a1', pabellon_id: 'p1', piso_id: 'p1-1', pabellon: 'Pabellón A', piso: 'Primer piso', codigo: 'A101', nombre: 'Aula 101' },
  { id: 'a2', pabellon_id: 'p1', piso_id: 'p1-1', pabellon: 'Pabellón A', piso: 'Primer piso', codigo: 'A102', nombre: 'Aula 102' },
  { id: 'a3', pabellon_id: 'p1', piso_id: 'p1-2', pabellon: 'Pabellón A', piso: 'Segundo piso', codigo: 'A201', nombre: 'Aula 201' },
  { id: 'a4', pabellon_id: 'p2', piso_id: 'p2-1', pabellon: 'Pabellón B', piso: 'Primer piso', codigo: 'B101', nombre: 'Laboratorio' },
]

test('resuelve la cadena pabellón, piso y ambiente con los padres reales', () => {
  assert.deepEqual(
    resolverSeleccionUbicacion({ pabellon: 'p2', piso: 'p2-1', ambiente: 'a1' }, ambientes),
    { pabellon: 'p1', piso: 'p1-1', ambiente: 'a1' },
  )
  assert.deepEqual(
    resolverSeleccionUbicacion({ pabellon: '', piso: 'p1-2', ambiente: '' }, ambientes),
    { pabellon: 'p1', piso: 'p1-2', ambiente: '' },
  )
  assert.deepEqual(
    resolverSeleccionUbicacion({ pabellon: 'p2', piso: '', ambiente: '' }, ambientes),
    { pabellon: 'p2', piso: '', ambiente: '' },
  )
})

test('descarta selecciones hijas inválidas sin perder el padre válido', () => {
  assert.deepEqual(
    resolverSeleccionUbicacion({ pabellon: 'p1', piso: 'inexistente', ambiente: 'inexistente' }, ambientes),
    { pabellon: 'p1', piso: '', ambiente: '' },
  )
  assert.deepEqual(
    resolverSeleccionUbicacion({ pabellon: 'inexistente', piso: '', ambiente: '' }, ambientes),
    { pabellon: '', piso: '', ambiente: '' },
  )
})

test('genera opciones dependientes y ordenadas', () => {
  assert.deepEqual(opcionesPabellon(ambientes), [
    { id: 'p1', nombre: 'Pabellón A' },
    { id: 'p2', nombre: 'Pabellón B' },
  ])
  assert.deepEqual(opcionesPiso(ambientes, 'p1'), [
    { id: 'p1-1', nombre: 'Primer piso' },
    { id: 'p1-2', nombre: 'Segundo piso' },
  ])
  assert.deepEqual(opcionesPiso(ambientes, ''), [])
  assert.deepEqual(opcionesAmbiente(ambientes, 'p1-1'), [
    { id: 'a1', codigo: 'A101', nombre: 'Aula 101' },
    { id: 'a2', codigo: 'A102', nombre: 'Aula 102' },
  ])
  assert.deepEqual(opcionesAmbiente(ambientes, ''), [])
})

test('convierte la selección de ubicación en IDs para el filtro remoto', () => {
  assert.deepEqual(
    idsAmbientesDeSeleccion({ pabellon: '', piso: '', ambiente: 'a3' }, ambientes),
    ['a3'],
  )
  assert.deepEqual(
    idsAmbientesDeSeleccion({ pabellon: 'p1', piso: 'p1-1', ambiente: '' }, ambientes),
    ['a1', 'a2'],
  )
  assert.deepEqual(
    idsAmbientesDeSeleccion({ pabellon: 'p2', piso: '', ambiente: '' }, ambientes),
    ['a4'],
  )
  assert.equal(
    idsAmbientesDeSeleccion({ pabellon: '', piso: '', ambiente: '' }, ambientes),
    undefined,
  )
})

test('cuenta únicamente los filtros que acotan el inventario', () => {
  const base = {
    busqueda: '',
    estado: '',
    categoria: '',
    pabellon: '',
    piso: '',
    ambiente: '',
    sinUbicacion: false,
    ambientesDashboard: [],
  }
  assert.equal(contarFiltrosActivos(base), 0)
  assert.equal(
    contarFiltrosActivos({
      ...base,
      busqueda: ' laptop ',
      estado: 'operativo',
      categoria: 'c1',
      pabellon: 'p1',
      ambiente: 'a1',
      sinUbicacion: true,
      ambientesDashboard: ['a1', 'a2'],
    }),
    7,
  )
  assert.equal(contarFiltrosActivos({ ...base, busqueda: '   ' }), 0)
})
