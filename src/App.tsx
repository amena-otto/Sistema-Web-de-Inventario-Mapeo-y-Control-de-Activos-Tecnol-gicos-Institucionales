import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import AdminLayout from './layouts/AdminLayout'
import Dashboard from './pages/dashboard'
import Equipos from './pages/Equipos'
import Ubicaciones from './pages/Ubicaciones'
import Mantenimientos from './pages/Mantenimientos'
import Movimientos from './pages/Movimientos'
import Reportes from './pages/Reportes'
import Usuarios from './pages/Usuarios'
import Login from './pages/Login'
import RestablecerPassword from './pages/RestablecerPassword'
import { useAuth } from './hooks/useAuth'
import { usePermissions, type Permiso } from './hooks/usePermissions'

function RutaProtegida() {
  const { session, perfil, cargando } = useAuth()

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600">
        Verificando acceso...
      </div>
    )
  }

  if (!session || !perfil) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

function RutaPorPermiso({
  permiso,
  children,
}: {
  permiso: Permiso
  children?: ReactNode
}) {
  const { can } = usePermissions()

  if (!can(permiso)) {
    return <Navigate to="/" replace />
  }

  return children ? <>{children}</> : <Outlet />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/restablecer-password"
          element={<RestablecerPassword />}
        />

        <Route element={<RutaProtegida />}>
          <Route element={<AdminLayout />}>
            <Route
              element={<RutaPorPermiso permiso="inventario.ver" />}
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/equipos" element={<Equipos />} />
              <Route path="/ubicaciones" element={<Ubicaciones />} />
            </Route>

            <Route
              element={<RutaPorPermiso permiso="reportes.ver" />}
            >
              <Route path="/reportes" element={<Reportes />} />
            </Route>

            <Route
              element={<RutaPorPermiso permiso="mantenimientos.ver" />}
            >
              <Route path="/mantenimientos" element={<Mantenimientos />} />
            </Route>

            <Route
              element={<RutaPorPermiso permiso="movimientos.ver" />}
            >
              <Route path="/movimientos" element={<Movimientos />} />
            </Route>

            <Route
              element={<RutaPorPermiso permiso="usuarios.administrar" />}
            >
              <Route path="/usuarios" element={<Usuarios />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}