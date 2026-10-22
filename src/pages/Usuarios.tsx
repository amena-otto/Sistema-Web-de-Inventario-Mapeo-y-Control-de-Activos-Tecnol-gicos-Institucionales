import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Perfil } from '../hooks/AuthContext'
import { useAuth } from '../hooks/useAuth'
import {
  actualizarPerfil,
  crearUsuario,
  eliminarUsuarioPermanente,
  listarPerfiles,
  type CambiosPerfil,
  type NuevoUsuario,
  type PerfilUsuario,
} from '../services/usuariosService'

type Rol = Perfil['rol']

const etiquetaRol: Record<Rol, string> = {
  admin: 'Administrador',
  tecnico: 'Técnico',
  consulta: 'Consulta',
}

function mensajeError(e: unknown, porDefecto: string) {
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  return porDefecto
}

export default function Usuarios() {
  const { perfil: yo } = useAuth()
  const [usuarios, setUsuarios] = useState<PerfilUsuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtroRol, setFiltroRol] = useState<'todos' | Rol>('todos')
  const [mostrarAntiguos, setMostrarAntiguos] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nombres, setNombres] = useState('')
  const [apellidos, setApellidos] = useState('')
  const [rolEditado, setRolEditado] = useState<Rol>('consulta')
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
  const [nuevoEmail, setNuevoEmail] = useState('')
  const [nuevosNombres, setNuevosNombres] = useState('')
  const [nuevosApellidos, setNuevosApellidos] = useState('')
  const [nuevoRol, setNuevoRol] = useState<Rol>('consulta')
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    let vigente = true

    listarPerfiles()
      .then((datos) => {
        if (vigente) setUsuarios(datos)
      })
      .catch((e) => {
        if (vigente)
          setError(mensajeError(e, 'No se pudo cargar la lista de usuarios.'))
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })

    return () => {
      vigente = false
    }
  }, [])

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()

    return usuarios.filter((u) => {
      const coincideTexto =
        !texto || `${u.nombres} ${u.apellidos}`.toLowerCase().includes(texto)
      const coincideRol = filtroRol === 'todos' || u.rol === filtroRol

      return u.activo !== mostrarAntiguos && coincideTexto && coincideRol
    })
  }, [usuarios, busqueda, filtroRol, mostrarAntiguos])

  async function aplicar(id: string, cambios: CambiosPerfil, textoOk: string) {
    setError('')
    setAviso('')
    setGuardandoId(id)

    try {
      await actualizarPerfil(id, cambios)
      setUsuarios((prev) =>
        prev.map((u) => (u.id === id ? { ...u, ...cambios } : u)),
      )
      setAviso(textoOk)
      return true
    } catch (e) {
      setError(mensajeError(e, 'No se pudo guardar el cambio.'))
      return false
    } finally {
      setGuardandoId(null)
    }
  }

  async function agregarUsuario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setAviso('')
    const email = nuevoEmail.trim().toLowerCase()
    if (
      !email.endsWith('@ottotonsmann.edu.pe') &&
      !email.endsWith('@gmail.com')
    ) {
      setError('Usa un correo @ottotonsmann.edu.pe o @gmail.com.')
      return
    }
    setCreando(true)

    const nuevo: NuevoUsuario = {
      email,
      nombres: nuevosNombres.trim(),
      apellidos: nuevosApellidos.trim(),
      rol: nuevoRol,
    }

    try {
      const perfil = await crearUsuario(nuevo)
      setUsuarios((prev) =>
        [...prev, perfil].sort((a, b) => a.apellidos.localeCompare(b.apellidos)),
      )
      setNuevoEmail('')
      setNuevosNombres('')
      setNuevosApellidos('')
      setNuevoRol('consulta')
      setAviso(`Se envió una invitación a ${perfil.email}.`)
    } catch (e) {
      setError(mensajeError(e, 'No se pudo crear la cuenta.'))
    } finally {
      setCreando(false)
    }
  }

  function empezarEdicion(u: PerfilUsuario) {
    setEditandoId(u.id)
    setNombres(u.nombres)
    setApellidos(u.apellidos)
    setRolEditado(u.rol)
  }

  function cancelarEdicion() {
    setEditandoId(null)
    setNombres('')
    setApellidos('')
  }

  async function guardarEdicion(u: PerfilUsuario) {
    if (!nombres.trim() || !apellidos.trim()) {
      setError('Nombres y apellidos son obligatorios.')
      return
    }

    const ok = await aplicar(
      u.id,
      {
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        ...((u.id !== yo?.id && rolEditado !== u.rol) ? { rol: rolEditado } : {}),
      },
      'Datos del usuario actualizados.',
    )
    if (ok) cancelarEdicion()
  }

  async function alternarEstado(u: PerfilUsuario) {
    if (u.activo) {
      const confirmar = window.confirm(
        `¿Desactivar a ${u.nombres} ${u.apellidos}? No podrá usar el sistema.`,
      )
      if (!confirmar) return
    }

    await aplicar(
      u.id,
      { activo: !u.activo },
      u.activo ? 'Usuario desactivado.' : 'Usuario activado.',
    )
  }

  async function eliminar(u: PerfilUsuario) {
    if (u.activo) {
      setError('Primero debes desactivar la cuenta antes de eliminarla.')
      return
    }

    const nombre = `${u.nombres} ${u.apellidos}`.trim()
    const confirmar = window.confirm(
      `¿Desea eliminar a ${nombre} permanentemente? Esta acción no se puede deshacer y eliminará su cuenta de acceso.`,
    )
    if (!confirmar) return

    setError('')
    setAviso('')
    setGuardandoId(u.id)
    try {
      await eliminarUsuarioPermanente(u.id)
      setUsuarios((actuales) => actuales.filter((usuario) => usuario.id !== u.id))
      setAviso(`La cuenta de ${nombre} fue eliminada permanentemente.`)
    } catch (e) {
      setError(mensajeError(e, 'No se pudo eliminar permanentemente la cuenta.'))
    } finally {
      setGuardandoId(null)
    }
  }

  return (
    <section>
      <h2 className="text-2xl font-semibold">Usuarios</h2>
      <p className="mt-1 text-sm text-slate-600">
        Invita al personal por correo. La persona recibirá un enlace para
        establecer su contraseña. Se aceptan correos institucionales y Gmail
        para pruebas.
      </p>

      <form
        onSubmit={(event) => void agregarUsuario(event)}
        className="mt-4 rounded-xl bg-white p-4 shadow"
      >
        <h3 className="font-semibold text-slate-900">Agregar usuario</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            pattern="[A-Za-z0-9._%+-]+@(ottotonsmann[.]edu[.]pe|gmail[.]com)"
            value={nuevoEmail}
            onChange={(event) => setNuevoEmail(event.target.value.toLowerCase())}
            placeholder="usuario@gmail.com o correo institucional"
            aria-label="Correo del nuevo usuario"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            required
            maxLength={100}
            value={nuevosNombres}
            onChange={(event) => setNuevosNombres(event.target.value)}
            placeholder="Nombres"
            aria-label="Nombres del nuevo usuario"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            required
            maxLength={100}
            value={nuevosApellidos}
            onChange={(event) => setNuevosApellidos(event.target.value)}
            placeholder="Apellidos"
            aria-label="Apellidos del nuevo usuario"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={nuevoRol}
            onChange={(event) => setNuevoRol(event.target.value as Rol)}
            aria-label="Rol del nuevo usuario"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="consulta">Consulta</option>
            <option value="tecnico">Técnico</option>
            <option value="admin">Administrador</option>
          </select>
          <button
            type="submit"
            disabled={creando}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {creando ? 'Enviando invitación...' : 'Crear e invitar'}
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setMostrarAntiguos((actual) => !actual)}
          className={`rounded-lg px-3 py-2 text-sm font-semibold ${
            mostrarAntiguos
              ? 'bg-slate-700 text-white'
              : 'border border-slate-300 bg-white text-slate-700'
          }`}
        >
          {mostrarAntiguos ? 'Volver a usuarios activos' : 'Usuarios antiguos'}
          {mostrarAntiguos
            ? ''
            : ` (${usuarios.filter((usuario) => !usuario.activo).length})`}
        </button>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-64"
        />
        <select
          value={filtroRol}
          onChange={(e) => setFiltroRol(e.target.value as 'todos' | Rol)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="todos">Todos los roles</option>
          <option value="admin">Administrador</option>
          <option value="tecnico">Técnico</option>
          <option value="consulta">Consulta</option>
        </select>
      </div>

      <p className="mt-3 text-sm text-slate-500">
        {mostrarAntiguos
          ? 'Cuentas desactivadas. Puedes reactivarlas o eliminarlas permanentemente.'
          : 'Cuentas activas. Para cambiar nombres o rol, selecciona Editar.'}
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {aviso}
        </p>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Usuario</th>
              <th className="px-5 py-3">Rol del sistema</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                  Cargando usuarios...
                </td>
              </tr>
            )}

            {!cargando && visibles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                  No hay usuarios que coincidan.
                </td>
              </tr>
            )}

            {visibles.map((u) => {
              const esYo = u.id === yo?.id
              const ocupado = guardandoId === u.id
              const editando = editandoId === u.id

              return (
                <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    {editando ? (
                      <div className="grid max-w-sm gap-2">
                        <input
                          value={nombres}
                          maxLength={100}
                          onChange={(e) => setNombres(e.target.value)}
                          aria-label={`Nombres de ${u.nombres} ${u.apellidos}`}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                        <input
                          value={apellidos}
                          maxLength={100}
                          onChange={(e) => setApellidos(e.target.value)}
                          aria-label={`Apellidos de ${u.nombres} ${u.apellidos}`}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </div>
                    ) : (
                      <div>
                        <p className="font-semibold text-slate-900">
                          {u.nombres} {u.apellidos}
                        </p>
                        {esYo && (
                          <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                            Tu cuenta
                          </span>
                        )}
                        <p className="mt-1 text-xs text-slate-500">
                          Registrado: {new Date(u.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </td>

                  <td className="px-5 py-4">
                    {editando && !esYo ? (
                      <label className="block max-w-52">
                        <span className="sr-only">Rol de {u.nombres} {u.apellidos}</span>
                        <select
                          value={rolEditado}
                          disabled={ocupado}
                          onChange={(e) => setRolEditado(e.target.value as Rol)}
                          className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        >
                          <option value="admin">Administrador</option>
                          <option value="tecnico">Técnico</option>
                          <option value="consulta">Consulta</option>
                        </select>
                      </label>
                    ) : (
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        u.rol === 'admin'
                          ? 'bg-violet-100 text-violet-800'
                          : u.rol === 'tecnico'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-700'
                      }`}>
                        {etiquetaRol[u.rol]}
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        u.activo
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>

                  <td className="px-5 py-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      {editando ? (
                        <>
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => void guardarEdicion(u)}
                            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                          >
                            {ocupado ? 'Guardando...' : 'Guardar cambios'}
                          </button>
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={cancelarEdicion}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => empezarEdicion(u)}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          Editar usuario
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={esYo || ocupado}
                        onClick={() => void alternarEstado(u)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                      {!u.activo && (
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() => void eliminar(u)}
                          className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          {ocupado ? 'Procesando...' : 'Eliminar permanentemente'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
    </section>
  )
}