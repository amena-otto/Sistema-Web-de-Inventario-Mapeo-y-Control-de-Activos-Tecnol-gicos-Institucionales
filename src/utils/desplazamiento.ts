const CONSULTA_MOVIMIENTO_REDUCIDO = '(prefers-reduced-motion: reduce)'

/**
 * Lleva la vista al inicio de un listado sin animación cuando el usuario
 * prefiere reducir el movimiento.
 */
export function desplazarAlInicioDeListado(elemento: HTMLElement | null) {
  if (!elemento) return

  const movimientoReducido =
    typeof window.matchMedia === 'function' &&
    window.matchMedia(CONSULTA_MOVIMIENTO_REDUCIDO).matches

  elemento.scrollIntoView({
    behavior: movimientoReducido ? 'auto' : 'smooth',
    block: 'start',
  })
}
