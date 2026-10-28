import { useEffect, useMemo, useRef, useState } from 'react'

export type SearchableSelectOption = {
  value: string
  label: string
  keywords?: string
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
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((option) => {
      const base = `${option.label} ${option.keywords ?? ''}`.toLowerCase()
      return base.includes(q)
    })
  }, [options, query])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && <span className="mb-1 block text-sm text-slate-700">{label}</span>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={selected ? 'text-slate-900' : 'text-slate-500'}>
            {selected ? selected.label : placeholder}
          </span>
          <span className="text-slate-400">▾</span>
        </button>
        {clearable && value && !disabled && (
          <button
            type="button"
            onClick={() => {
              onChange('')
              setOpen(false)
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
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              autoFocus
            />
          </div>
          <ul className="max-h-60 overflow-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">{emptyMessage}</li>
            ) : (
              filtered.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${value === option.value ? 'bg-slate-50 font-medium' : ''}`}
                  >
                    {option.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
