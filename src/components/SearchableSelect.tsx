import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { normalizarTexto } from '../utils/inventario'

export type SearchableSelectOption = {
  value: string
  label: string
  keywords?: string
  detalle?: string
}

type SearchableSelectProps = {
  label?: string
  placeholder?: string
  options: SearchableSelectOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  emptyMessage?: string
  clearable?: boolean
  /** Búsqueda bajo demanda: el componente avisa del término (con retardo). */
  onBuscar?: (termino: string) => void
  /** Las opciones ya vienen filtradas por el servidor. */
  remoto?: boolean
  buscando?: boolean
  /** Etiqueta del valor seleccionado cuando no está en la página actual. */
  selectedLabel?: string | null
  onCargarMas?: () => void
  hayMas?: boolean
}

export default function SearchableSelect({
  label,
  placeholder = 'Seleccionar...',
  options,
  value,
  onChange,
  disabled = false,
  className = '',
  emptyMessage = 'Sin resultados',
  clearable = true,
  onBuscar,
  remoto = false,
  buscando = false,
  selectedLabel = null,
  onCargarMas,
  hayMas = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const queryDebounced = useDebouncedValue(query, 250)

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  )

  const filtered = useMemo(() => {
    if (remoto) return options
    const q = normalizarTexto(query.trim())
    if (!q) return options
    return options.filter((option) => {
      const base = normalizarTexto(`${option.label} ${option.keywords ?? ''}`)
      return base.includes(q)
    })
  }, [options, query, remoto])

  useEffect(() => {
    if (remoto && onBuscar) onBuscar(queryDebounced)
  }, [remoto, onBuscar, queryDebounced])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  const indiceActivo = Math.min(activeIndex, Math.max(filtered.length - 1, 0))

  function seleccionar(option: SearchableSelectOption) {
    onChange(option.value)
    setOpen(false)
    setQuery('')
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(Math.min(indiceActivo + 1, Math.max(filtered.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(Math.max(indiceActivo - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const opcion = filtered[indiceActivo]
      if (opcion) seleccionar(opcion)
    } else if (event.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  const textoSeleccionado = selected?.label ?? selectedLabel ?? placeholder

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && <span className="mb-1 block text-sm text-slate-700">{label}</span>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => {
            if (disabled) return
            setOpen((v) => !v)
            setQuery('')
          }}
          className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={selected || selectedLabel ? 'text-slate-900' : 'text-slate-500'}>
            {textoSeleccionado}
          </span>
          <span className="text-slate-400">▾</span>
        </button>
        {clearable && value && !disabled && (
          <button
            type="button"
            onClick={() => {
              onChange('')
              setOpen(false)
              setQuery('')
            }}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            Limpiar
          </button>
        )}
      </div>
      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="p-2">
            <input
              ref={searchRef}
              type="search"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={
                filtered.length ? `${listId}-opcion-${indiceActivo}` : undefined
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Buscar..."
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <ul id={listId} role="listbox" className="max-h-60 overflow-auto">
            {buscando ? (
              <li className="px-3 py-2 text-sm text-slate-500">Buscando...</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">{emptyMessage}</li>
            ) : (
              filtered.map((option, indice) => (
                <li
                  key={option.value}
                  id={`${listId}-opcion-${indice}`}
                  role="option"
                  aria-selected={value === option.value}
                >
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(indice)}
                    onClick={() => seleccionar(option)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                      value === option.value || indiceActivo === indice
                        ? 'bg-slate-50 font-medium'
                        : ''
                    }`}
                  >
                    <span className="block font-medium">{option.label}</span>
                    {option.detalle && (
                      <span className="mt-0.5 block whitespace-pre-line text-xs font-normal text-slate-500">
                        {option.detalle}
                      </span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
          {hayMas && (
            <div className="border-t border-slate-100 p-2 text-center">
              <button
                type="button"
                onClick={onCargarMas}
                disabled={buscando}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-50"
              >
                {buscando ? 'Cargando...' : 'Cargar más resultados'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
