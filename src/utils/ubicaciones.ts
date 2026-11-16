import { normalizarTexto } from './inventario.ts'

export function esOficina(ambiente: { tipo?: string; pabellon?: string }) {
  return ambiente.tipo === 'oficina' || normalizarTexto(ambiente.pabellon ?? '') === 'areas'
}

export function nombreUbicacion(a: { nombre: string; codigo?: string | null; tipo?: string; pabellon?: string; piso?: string }) {
  if (esOficina(a)) return `Áreas académicas / ${a.nombre}`
  return [a.pabellon, a.piso, [a.codigo, a.nombre].filter(Boolean).join(' — ')].filter(Boolean).join(' / ')
}

export const iconosUbicacion = ['oficina', 'aula', 'laboratorio', 'contabilidad', 'personas', 'tecnologia', 'marketing', 'logistica', 'tesoreria'] as const
export type IconoUbicacion = typeof iconosUbicacion[number]
export function sugerirIcono(nombre: string, tipo = ''): IconoUbicacion {
  const texto = normalizarTexto(nombre)
  if (/contab/.test(texto)) return 'contabilidad'
  if (/tesorer/.test(texto)) return 'tesoreria'
  if (/marketing/.test(texto)) return 'marketing'
  if (/logistic/.test(texto)) return 'logistica'
  if (/tecnolog/.test(texto)) return 'tecnologia'
  if (/admision|estudiante|bienestar/.test(texto)) return 'personas'
  return tipo === 'laboratorio' ? 'laboratorio' : tipo === 'aula' ? 'aula' : 'oficina'
}
export function iconoCategoria(nombre: string) {
  const texto = normalizarTexto(nombre)
  if (/impres|escan/.test(texto)) return 'impresora'
  if (/router|switch|red/.test(texto)) return 'red'
  if (/proyector/.test(texto)) return 'proyector'
  if (/monitor|pantalla/.test(texto)) return 'monitor'
  if (/laptop|portatil/.test(texto)) return 'portatil'
  return 'computadora'
}
