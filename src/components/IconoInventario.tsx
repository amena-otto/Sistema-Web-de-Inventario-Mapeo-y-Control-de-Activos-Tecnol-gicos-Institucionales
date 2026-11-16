const trazos: Record<string, string> = {
  oficina: 'M3 21V3h12v18M15 9h6v12M7 7h4M7 11h4M7 15h4M2 21h20',
  aula: 'M3 3h18v13H3zM8 21l4-5 4 5M7 7h10M7 11h6',
  laboratorio: 'M9 3h6M10 3v6l-6 10q-1 2 2 2h12q3 0 2-2L14 9V3M8 14h8',
  contabilidad: 'M5 2h14v20H5zM8 5h8v4H8zM8 13h1M12 13h1M16 13h1M8 17h1M12 17h1M16 17h1',
  personas: 'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 8M22 21v-3a4 4 0 0 0-3-4',
  tecnologia: 'M14 6l4-4a6 6 0 0 1-7 8L3 18a2 2 0 0 0 3 3l8-8a6 6 0 0 1 8-7l-4 4z',
  marketing: 'M3 10v4h5l10 5V5L8 10zM8 14l2 7h4l-3-6M21 9v6',
  logistica: 'M3 7l9-5 9 5v10l-9 5-9-5zM3 7l9 5 9-5M12 12v10',
  tesoreria: 'M3 5h17v16H3zM3 5V3h15M14 11h8v6h-8zM17 14h1',
  computadora: 'M3 3h18v13H3zM12 16v5M7 21h10',
  monitor: 'M3 3h18v13H3zM12 16v5M7 21h10',
  portatil: 'M5 3h14v14H5zM2 21h20l-3-4H5z',
  impresora: 'M6 8V2h12v6M6 17H2V8h20v9h-4M6 13h12v9H6z',
  red: 'M8 2h8v6H8zM12 8v5M4 13h16M4 13v3M20 13v3M1 16h6v6H1zM17 16h6v6h-6z',
  proyector: 'M2 7h20v12H2zM17 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6M5 11h4M5 14h4M6 7V4M18 7V4',
}
export default function IconoInventario({ nombre, className = 'h-6 w-6' }: { nombre: string; className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={trazos[nombre] ?? trazos.oficina} /></svg>
}
