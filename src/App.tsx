import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect, type ReactNode } from 'react'
import AdminLayout from './layouts/AdminLayout'
import Dashboard from './pages/dashboard'
import Mantenimientos from './pages/Mantenimientos'
import Movimientos from './pages/Movimientos'
import Reportes from './pages/Reportes'
import Usuarios from './pages/Usuarios'
import Login from './pages/Login'
import RecuperarPassword from './pages/RecuperarPassword'
import RestablecerPassword from './pages/RestablecerPassword'
import { useAuth } from './hooks/useAuth'
import { usePermissions, type Permiso } from './hooks/usePermissions'

const Equipos = lazy(() => import('./pages/Equipos'))
const Ubicaciones = lazy(() => import('./pages/Ubicaciones'))

function RutaProtegida() {
  const { session, perfil, cargando } = useAuth()
  const location = useLocation()

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600">
        Verificando acceso...
      </div>
    )
  }

  if (!session || !perfil) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    )
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
    return <Navigate to="/dashboard" replace />
  }

  return children ? <>{children}</> : <Outlet />
}

function RevalidarAcceso() {
  const { session, verificarAcceso } = useAuth()
  const location = useLocation()

  useEffect(() => {
    if (!session) return
    void verificarAcceso()
  }, [session, location.pathname, verificarAcceso])

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <RevalidarAcceso />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/recuperar-password" element={<RecuperarPassword />} />
        <Route
          path="/restablecer-password"
          element={<RestablecerPassword />}
        />

        <Route element={<RutaProtegida />}>
          <Route element={<AdminLayout />}>
            <Route
              element={<RutaPorPermiso permiso="inventario.ver" />}
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route
                path="/equipos"
                element={
                  <Suspense
                    fallback={
                      <div className="py-8 text-center text-slate-600">
                        Cargando inventario...
                      </div>
                    }
                  >
                    <Equipos />
                  </Suspense>
                }
              />
              <Route
                path="/ubicaciones"
                element={
                  <Suspense
                    fallback={
                      <div className="py-8 text-center text-slate-600">
                        Cargando ubicaciones...
                      </div>
                    }
                  >
                    <Ubicaciones />
                  </Suspense>
                }
              />
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

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}