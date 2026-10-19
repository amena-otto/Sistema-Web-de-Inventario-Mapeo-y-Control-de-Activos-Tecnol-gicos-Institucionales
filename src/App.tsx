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
import { useAuth, type Perfil } from './hooks/AuthContext'

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

function RutaPorRol({
  roles,
  children,
}: {
  roles: Perfil['rol'][]
  children?: ReactNode
}) {
  const { perfil } = useAuth()

  if (!perfil || !roles.includes(perfil.rol)) {
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
            <Route path="/" element={<Dashboard />} />

            <Route
              element={
                <RutaPorRol roles={['admin', 'tecnico', 'consulta']} />
              }
            >
              <Route path="/equipos" element={<Equipos />} />
              <Route path="/ubicaciones" element={<Ubicaciones />} />
              <Route path="/reportes" element={<Reportes />} />
            </Route>

            <Route element={<RutaPorRol roles={['admin', 'tecnico']} />}>
              <Route path="/mantenimientos" element={<Mantenimientos />} />
              <Route path="/movimientos" element={<Movimientos />} />
            </Route>

            <Route element={<RutaPorRol roles={['admin']} />}>
              <Route path="/usuarios" element={<Usuarios />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}