import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ajustarPagina,
  calcularRangoVisible,
  calcularTotalPaginas,
  etiquetaRangoVisible,
  normalizarPorPagina,
  OPCIONES_POR_PAGINA,
  POR_PAGINA_PREDETERMINADO,
} from '../src/utils/paginacion.ts'

test('solo acepta tamaños de página de 5, 10 o 20 y usa 10 por defecto', () => {
  assert.deepEqual([...OPCIONES_POR_PAGINA], [5, 10, 20])
  assert.equal(POR_PAGINA_PREDETERMINADO, 10)
  for (const valor of [5, 10, 20, '5', '10', '20']) {
    assert.equal(normalizarPorPagina(valor), Number(valor))
  }
  for (const valor of [undefined, null, '', 0, 1, 12, 100, 'abc']) {
    assert.equal(normalizarPorPagina(valor), 10)
  }
})

test('calcula el total de páginas sin permitir cero páginas', () => {
  assert.equal(calcularTotalPaginas(0, 10), 1)
  assert.equal(calcularTotalPaginas(-5, 10), 1)
  assert.equal(calcularTotalPaginas(47, 10), 5)
  assert.equal(calcularTotalPaginas(50, 10), 5)
  assert.equal(calcularTotalPaginas(51, 10), 6)
  assert.equal(calcularTotalPaginas(3, 0), 3)
})

test('limita la página al rango válido', () => {
  assert.equal(ajustarPagina(0, 5), 1)
  assert.equal(ajustarPagina(-2, 5), 1)
  assert.equal(ajustarPagina(3, 5), 3)
  assert.equal(ajustarPagina(99, 5), 5)
  assert.equal(ajustarPagina(2, 0), 1)
  assert.equal(ajustarPagina(Number.NaN, 4), 1)
})

test('devuelve el rango visible correcto para cada página', () => {
  assert.deepEqual(calcularRangoVisible(1, 10, 47), {
    pagina: 1,
    totalPaginas: 5,
    inicio: 1,
    fin: 10,
    total: 47,
  })
  assert.deepEqual(calcularRangoVisible(2, 10, 47), {
    pagina: 2,
    totalPaginas: 5,
    inicio: 11,
    fin: 20,
    total: 47,
  })
  assert.deepEqual(calcularRangoVisible(5, 10, 47), {
    pagina: 5,
    totalPaginas: 5,
    inicio: 41,
    fin: 47,
    total: 47,
  })
  assert.deepEqual(calcularRangoVisible(99, 10, 47), {
    pagina: 5,
    totalPaginas: 5,
    inicio: 41,
    fin: 47,
    total: 47,
  })
  assert.deepEqual(calcularRangoVisible(1, 10, 0), {
    pagina: 1,
    totalPaginas: 1,
    inicio: 0,
    fin: 0,
    total: 0,
  })
})

test('describe el rango visible con el sustantivo solicitado', () => {
  assert.equal(
    etiquetaRangoVisible(calcularRangoVisible(2, 10, 47)),
    'Mostrando 11–20 de 47 equipos',
  )
  assert.equal(
    etiquetaRangoVisible(calcularRangoVisible(1, 20, 47), 'resultados'),
    'Mostrando 1–20 de 47 resultados',
  )
  assert.equal(etiquetaRangoVisible(calcularRangoVisible(1, 10, 0)), '0 equipos')
})
