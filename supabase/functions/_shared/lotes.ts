/**
 * Divide una lista en lotes consecutivos de tamaño fijo.
 *
 * Se usa para enviar los identificadores de Google Drive a la Edge Function
 * fotografias-drive, que acepta como máximo 100 identificadores por solicitud.
 * El último lote puede contener menos elementos.
 */
export function dividirEnLotes<T>(
  elementos: readonly T[],
  tamano: number,
): T[][] {
  if (!Number.isInteger(tamano) || tamano < 1) {
    throw new RangeError('El tamaño del lote debe ser un entero mayor que cero.')
  }

  const lotes: T[][] = []
  for (let indice = 0; indice < elementos.length; indice += tamano) {
    lotes.push(elementos.slice(indice, indice + tamano))
  }
  return lotes
}
