import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AdminLayout from './layouts/AdminLayout'
import Dashboard from './pages/dashboard'
import Equipos from './pages/Equipos'
import Ubicaciones from './pages/Ubicaciones'
import Mantenimientos from './pages/Mantenimientos'
import Movimientos from './pages/Movimientos'
import Reportes from './pages/Reportes'
import Usuarios from './pages/Usuarios'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/equipos" element={<Equipos />} />
          <Route path="/ubicaciones" element={<Ubicaciones />} />
          <Route path="/mantenimientos" element={<Mantenimientos />} />
          <Route path="/movimientos" element={<Movimientos />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="/usuarios" element={<Usuarios />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}