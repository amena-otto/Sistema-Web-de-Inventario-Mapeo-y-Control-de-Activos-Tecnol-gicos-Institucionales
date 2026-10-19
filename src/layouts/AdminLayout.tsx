import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth, type Perfil } from '../hooks/AuthContext'

const menu: {
  to: string
  label: string
  roles: Perfil['rol'][]
}[] = [
  { to: '/', label: 'Dashboard', roles: ['admin', 'tecnico', 'consulta'] },
  { to: '/equipos', label: 'Equipos', roles: ['admin', 'tecnico', 'consulta'] },
  { to: '/ubicaciones', label: 'Ubicaciones', roles: ['admin', 'tecnico', 'consulta'] },
  { to: '/mantenimientos', label: 'Mantenimientos', roles: ['admin', 'tecnico'] },
  { to: '/movimientos', label: 'Movimientos', roles: ['admin', 'tecnico'] },
  { to: '/reportes', label: 'Reportes', roles: ['admin', 'tecnico', 'consulta'] },
  { to: '/usuarios', label: 'Usuarios', roles: ['admin'] },
]

const nombreRol: Record<Perfil['rol'], string> = {
  admin: 'Administrador',
  tecnico: 'Técnico',
  consulta: 'Consulta',
}

export default function AdminLayout() {
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState('')
  const { perfil, cerrarSesion } = useAuth()
  const navigate = useNavigate()

  const menuVisible = menu.filter(
    (item) => perfil && item.roles.includes(perfil.rol),
  )

  async function manejarCierreSesion() {
    setError('')

    try {
      await cerrarSesion()
      navigate('/login', { replace: true })
    } catch {
      setError('No se pudo cerrar la sesión. Inténtalo nuevamente.')
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside
        className={`fixed inset-y-0 left-0 z-20 w-60 bg-slate-900 p-4 text-slate-100 transition-transform md:static md:translate-x-0 ${
          abierto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <h1 className="mb-6 text-lg font-bold">Inventario OT</h1>
        <nav className="flex flex-col gap-1">
          {menuVisible.map((item) => (
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 shadow">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Abrir o cerrar menú"
              className="rounded border px-3 py-1 md:hidden"
              onClick={() => setAbierto(!abierto)}
            >
              Menú
            </button>

            <span className="font-medium">IES Privado Otto Tonsmann</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-slate-600">
              <p className="font-semibold text-slate-800">
                {perfil ? `${perfil.nombres} ${perfil.apellidos}` : 'Usuario'}
              </p>
              <p>{perfil ? nombreRol[perfil.rol] : ''}</p>
            </div>

            <button
              type="button"
              onClick={manejarCierreSesion}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        {error && (
          <p
            role="alert"
            className="mx-6 mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
