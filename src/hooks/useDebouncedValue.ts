import { useEffect, useState } from 'react'

export function useDebouncedValue<T>(valor: T, esperaMs = 300): T {
  const [debounced, setDebounced] = useState(valor)

  useEffect(() => {
    const temporizador = window.setTimeout(() => setDebounced(valor), esperaMs)
    return () => window.clearTimeout(temporizador)
  }, [valor, esperaMs])

  return debounced
}
