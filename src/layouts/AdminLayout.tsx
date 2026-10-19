import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const menu = [
  { to: '/', label: 'Dashboard' },
  { to: '/equipos', label: 'Equipos' },
  { to: '/ubicaciones', label: 'Ubicaciones' },
  { to: '/mantenimientos', label: 'Mantenimientos' },
  { to: '/movimientos', label: 'Movimientos' },
  { to: '/reportes', label: 'Reportes' },
  { to: '/usuarios', label: 'Usuarios' },
]

export default function AdminLayout() {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside
        className={`fixed inset-y-0 left-0 z-20 w-60 bg-slate-900 p-4 text-slate-100 transition-transform md:static md:translate-x-0 ${
          abierto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <h1 className="mb-6 text-lg font-bold">Inventario OT</h1>
        <nav className="flex flex-col gap-1">
          {menu.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setAbierto(false)}
              className={({ isActive }) =>
                `rounded px-3 py-2 text-sm ${
                  isActive ? 'bg-blue-600' : 'hover:bg-slate-800'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center gap-3 bg-white p-4 shadow">
          <button
            className="rounded border px-3 py-1 md:hidden"
            onClick={() => setAbierto(!abierto)}
          >
            ☰
          </button>
          <span className="font-medium">IES Privado Otto Tonsmann</span>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
