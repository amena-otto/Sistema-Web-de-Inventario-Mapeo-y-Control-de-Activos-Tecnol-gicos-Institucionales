import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Perfil } from '../hooks/AuthContext'
import { useAuth } from '../hooks/useAuth'
import {
  actualizarPerfil,
  crearUsuario,
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
    if (!email.endsWith('@ottotonsmann.edu.pe')) {
      setError('Solo se permiten correos @ottotonsmann.edu.pe.')
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
  }

  async function guardarNombre(u: PerfilUsuario) {
    if (!nombres.trim() || !apellidos.trim()) {
      setError('Nombres y apellidos son obligatorios.')
      return
    }

    const ok = await aplicar(
      u.id,
      { nombres: nombres.trim(), apellidos: apellidos.trim() },
      'Datos actualizados.',
    )
    if (ok) setEditandoId(null)
  }

  async function cambiarRol(u: PerfilUsuario, rol: Rol) {
    if (rol === u.rol) return
    await aplicar(u.id, { rol }, `Rol de ${u.nombres} cambiado a ${etiquetaRol[rol]}.`)
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

  return (
    <section>
      <h2 className="text-2xl font-semibold">Usuarios</h2>
      <p className="mt-1 text-sm text-slate-600">
        Invita al personal por correo. La persona recibirá un enlace para
        establecer su contraseña. Solo se aceptan correos
        {' '}@ottotonsmann.edu.pe.
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
            pattern="[A-Za-z0-9._%+-]+@ottotonsmann[.]edu[.]pe"
            value={nuevoEmail}
            onChange={(event) => setNuevoEmail(event.target.value.toLowerCase())}
            placeholder="usuario@ottotonsmann.edu.pe"
            aria-label="Correo institucional"
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
          ? 'Mostrando cuentas desactivadas. Puedes activarlas desde esta lista.'
          : 'Mostrando únicamente cuentas activas.'}
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

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  Cargando usuarios...
                </td>
              </tr>
            )}

            {!cargando && visibles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No hay usuarios que coincidan.
                </td>
              </tr>
            )}

            {visibles.map((u) => {
              const esYo = u.id === yo?.id
              const ocupado = guardandoId === u.id
              const editando = editandoId === u.id

              return (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    {editando ? (
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={nombres}
                          onChange={(e) => setNombres(e.target.value)}
                          aria-label="Nombres"
                          className="w-36 rounded border border-slate-300 px-2 py-1"
                        />
                        <input
                          value={apellidos}
                          onChange={(e) => setApellidos(e.target.value)}
                          aria-label="Apellidos"
                          className="w-36 rounded border border-slate-300 px-2 py-1"
                        />
                      </div>
                    ) : (
                      <>
                        <span className="font-medium">
                          {u.nombres} {u.apellidos}
                        </span>
                        {esYo && (
                          <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                            Tú
                          </span>
                        )}
                      </>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <select
                      value={u.rol}
                      disabled={esYo || ocupado}
                      onChange={(e) => void cambiarRol(u, e.target.value as Rol)}
                      className="rounded border border-slate-300 px-2 py-1 disabled:bg-slate-100"
                    >
                      <option value="admin">Administrador</option>
                      <option value="tecnico">Técnico</option>
                      <option value="consulta">Consulta</option>
                    </select>
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        u.activo
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {editando ? (
                        <>
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => void guardarNombre(u)}
                            className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-60"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditandoId(null)}
                            className="rounded border border-slate-300 px-3 py-1"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => empezarEdicion(u)}
                          className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100"
                        >
                          Editar
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={esYo || ocupado}
                        onClick={() => void alternarEstado(u)}
                        className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}