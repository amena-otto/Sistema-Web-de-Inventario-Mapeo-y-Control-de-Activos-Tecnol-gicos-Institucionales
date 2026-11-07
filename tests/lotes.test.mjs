import test from 'node:test'
import assert from 'node:assert/strict'
import { dividirEnLotes } from '../supabase/functions/_shared/lotes.ts'

test('dividirEnLotes devuelve una lista vacía para una entrada vacía', () => {
  assert.deepEqual(dividirEnLotes([], 50), [])
})

test('dividirEnLotes respeta el tamaño y conserva el orden', () => {
  assert.deepEqual(dividirEnLotes([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
})

test('dividirEnLotes agrupa más de 100 fotografías en lotes de 50', () => {
  const ids = Array.from({ length: 101 }, (_, indice) => `drive-${indice + 1}`)
  const lotes = dividirEnLotes(ids, 50)

  assert.deepEqual(lotes.map((lote) => lote.length), [50, 50, 1])
  assert.equal(lotes.flat().length, 101)
  assert.equal(lotes[2][0], 'drive-101')
})

test('dividirEnLotes rechaza tamaños inválidos', () => {
  assert.throws(() => dividirEnLotes([1], 0), RangeError)
  assert.throws(() => dividirEnLotes([1], -1), RangeError)
  assert.throws(() => dividirEnLotes([1], 1.5), RangeError)
})
