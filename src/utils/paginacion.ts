export const OPCIONES_POR_PAGINA = [5, 10, 20] as const
export type PorPagina = (typeof OPCIONES_POR_PAGINA)[number]
export const POR_PAGINA_PREDETERMINADO: PorPagina = 10

export function normalizarPorPagina(
  valor: number | string | null | undefined,
): PorPagina {
  const numero = Number(valor)
  return (OPCIONES_POR_PAGINA as readonly number[]).includes(numero)
    ? (numero as PorPagina)
    : POR_PAGINA_PREDETERMINADO
}

export function calcularTotalPaginas(total: number, porPagina: number): number {
  if (!Number.isFinite(total) || total <= 0) return 1
  const tamano = Math.max(1, Math.floor(porPagina) || 1)
  return Math.max(1, Math.ceil(total / tamano))
}

export function ajustarPagina(pagina: number, totalPaginas: number): number {
  if (!Number.isFinite(pagina)) return 1
  const maximo = Math.max(1, Math.floor(totalPaginas) || 1)
  return Math.min(Math.max(1, Math.floor(pagina)), maximo)
}

export type RangoVisible = {
  pagina: number
  totalPaginas: number
  inicio: number
  fin: number
  total: number
}

export function calcularRangoVisible(
  pagina: number,
  porPagina: number,
  total: number,
): RangoVisible {
  const totalSeguro = Math.max(0, Math.floor(total) || 0)
  const tamano = Math.max(1, Math.floor(porPagina) || 1)
  const totalPaginas = calcularTotalPaginas(totalSeguro, tamano)
  const paginaActual = ajustarPagina(pagina, totalPaginas)
  return {
    pagina: paginaActual,
    totalPaginas,
    inicio: totalSeguro === 0 ? 0 : (paginaActual - 1) * tamano + 1,
    fin: Math.min(totalSeguro, paginaActual * tamano),
    total: totalSeguro,
  }
}

export function etiquetaRangoVisible(
  rango: RangoVisible,
  sustantivo = 'equipos',
): string {
  if (rango.total === 0) return `0 ${sustantivo}`
  return `Mostrando ${rango.inicio}–${rango.fin} de ${rango.total} ${sustantivo}`
}
