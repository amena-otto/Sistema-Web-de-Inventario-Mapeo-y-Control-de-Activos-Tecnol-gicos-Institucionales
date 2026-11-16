export function mismosIds(a: readonly string[], b: readonly string[]) {
  const x = [...new Set(a)].sort()
  const y = [...new Set(b)].sort()
  return x.length === y.length && x.every((id, i) => id === y[i])
}
// Una sola fila por activo. El equipo físicamente presente no se repite como externo.
export function compartidosExternos<T extends { id: string; ambiente_id: string | null; situacion: string }>(equipos: readonly T[], ambienteId: string) {
  return [...new Map(equipos.filter((e) => e.ambiente_id !== ambienteId && e.situacion === 'activo').map((e) => [e.id, e])).values()]
}
