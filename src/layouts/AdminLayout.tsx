import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { Perfil } from '../hooks/AuthContext'
import { useAuth } from '../hooks/useAuth'
import { usePermissions, type Permiso } from '../hooks/usePermissions'

const menu: {
  to: string
  label: string
  permiso: Permiso
  clave: string
  icono: string
}[] = [
  { to: '/dashboard', label: 'Dashboard', permiso: 'inventario.ver', clave: 'D', icono: 'M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6' },
  { to: '/equipos', label: 'Equipos', permiso: 'inventario.ver', clave: 'EQ', icono: 'M4 5h16v11H4zM8 20h8M12 16v4' },
  { to: '/ubicaciones', label: 'Ubicaciones', permiso: 'inventario.ver', clave: 'UB', icono: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM12 10h.01' },
  { to: '/mantenimientos', label: 'Mantenimientos', permiso: 'mantenimientos.ver', clave: 'MT', icono: 'M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-3-3z' },
  { to: '/movimientos', label: 'Movimientos', permiso: 'movimientos.ver', clave: 'MV', icono: 'M4 7h13l-3-3m6 13H7l3 3' },
  { to: '/reportes', label: 'Reportes', permiso: 'reportes.ver', clave: 'RP', icono: 'M5 19V9m7 10V5m7 14v-7M3 20h18' },
  { to: '/usuarios', label: 'Usuarios', permiso: 'usuarios.administrar', clave: 'US', icono: 'M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1m6-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8m6-7a4 4 0 0 1 0 7m1 3a4 4 0 0 1 3 4v2' },
]

const nombreRol: Record<Perfil['rol'], string> = {
  admin: 'Administrador',
  tecnico: 'Técnico',
  consulta: 'Consulta',
}

export default function AdminLayout() {
  const [abierto, setAbierto] = useState(false)
  const [menuContraido, setMenuContraido] = useState(false)
  const [error, setError] = useState('')
  const { perfil, cerrarSesion } = useAuth()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const location = useLocation()
  const menuVisible = menu.filter((item) => can(item.permiso))
  const seccionActual =
    menuVisible.find(
      (item) =>
        location.pathname === item.to ||
        location.pathname.startsWith(`${item.to}/`),
    )?.label ?? 'Institucional'
  const iniciales = `${perfil?.nombres?.[0] ?? 'U'}${perfil?.apellidos?.[0] ?? ''}`.toUpperCase()

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
    <div className="min-h-screen bg-white text-slate-800">
      {abierto && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-slate-950/50 md:hidden"
          onClick={() => setAbierto(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-[#0f1026] text-white shadow-xl transition-all duration-200 md:translate-x-0 ${
          menuContraido ? 'w-[270px] md:w-20' : 'w-[270px]'
        } ${
          abierto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className={`border-b border-white/10 px-6 py-6 ${menuContraido ? 'md:px-4' : ''}`}>
          <div className={`flex items-center gap-3 ${menuContraido ? 'md:justify-center' : ''}`}>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-orange-300/70 bg-white/10 text-lg font-black text-orange-200">
              OT
            </div>
            <div className={menuContraido ? 'md:hidden' : ''}>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-200">Instituto</p>
              <h1 className="mt-1 text-sm font-bold leading-tight">Otto Tonsmann</h1>
            </div>
          </div>
          <p className={`mt-5 text-xs leading-relaxed text-white/80 ${menuContraido ? 'md:hidden' : ''}`}>
            Gestión institucional de activos tecnológicos
          </p>
        </div>

        <nav aria-label="Navegación principal" className="flex-1 space-y-1 px-3 py-5">
          <p className={`mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/70 ${menuContraido ? 'md:hidden' : ''}`}>Menú principal</p>
          {menuVisible.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              onClick={() => setAbierto(false)}
              title={menuContraido ? item.label : undefined}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-lg border-l-[3px] py-3 text-sm transition ${
                  menuContraido ? 'px-3 md:justify-center md:px-2' : 'px-3'
                } ${
                  isActive
                    ? 'border-orange-300 bg-white/15 font-semibold text-white'
                    : 'border-transparent text-white/85 hover:bg-white/[0.12] hover:text-white'
                }`
              }
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[19px] w-[19px] shrink-0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icono} />
              </svg>
              <span className={menuContraido ? 'md:hidden' : ''}>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={`m-4 rounded-xl border border-white/15 bg-white/[0.08] p-4 ${menuContraido ? 'md:hidden' : ''}`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-200">Control institucional</p>
          <p className="mt-2 text-xs leading-relaxed text-white/80">Información organizada para una gestión responsable de los recursos.</p>
        </div>
        <div className={`border-t border-white/15 px-6 py-4 text-[10px] text-white/60 ${menuContraido ? 'md:hidden' : ''}`}>
          SISTEMA DE INVENTARIO · OT
        </div>
      </aside>

      <div className={`min-h-screen transition-[padding] duration-200 ${menuContraido ? 'md:pl-20' : 'md:pl-[270px]'}`}>
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
          <div className="flex min-h-[76px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-9">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="Abrir menú"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 md:hidden"
                onClick={() => setAbierto(true)}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <button
                type="button"
                aria-label={menuContraido ? 'Expandir menú' : 'Contraer menú'}
                aria-expanded={!menuContraido}
                className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-50 md:flex"
                onClick={() => setMenuContraido((actual) => !actual)}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={menuContraido ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7'} />
                </svg>
              </button>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-[#0f1026]">IES Privado Otto Tonsmann</p>
                <h2 className="mt-0.5 truncate text-lg font-bold text-slate-900">{seccionActual}</h2>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="max-w-48 truncate text-sm font-semibold text-slate-800">
                  {perfil ? `${perfil.nombres} ${perfil.apellidos}` : 'Usuario'}
                </p>
                <p className="text-xs text-slate-500">{perfil ? nombreRol[perfil.rol] : ''}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700 ring-2 ring-white">
                {iniciales}
              </div>
              <button
                type="button"
                onClick={manejarCierreSesion}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 sm:text-sm"
              >
                <span className="hidden sm:inline">Cerrar sesión</span>
                <span className="sm:hidden">Salir</span>
              </button>
            </div>
          </div>
        </header>

        {error && (
          <p role="alert" className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:mx-6 lg:mx-9">
            {error}
          </p>
        )}

        <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:px-9 lg:py-8">
          <Outlet />
        </main>
        <footer className="px-6 pb-6 text-center text-[11px] text-slate-400">
          Instituto de Educación Superior Privado Otto Tonsmann
        </footer>
      </div>
    </div>
  )
}
