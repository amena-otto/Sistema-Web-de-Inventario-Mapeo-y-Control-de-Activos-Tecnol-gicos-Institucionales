import { filtrarEquiposUbicacion, etiquetasEstadoUbicacion as etiquetaEstado } from '../utils/busquedaEquiposUbicacion'
import { idsAmbientesDelPiso, registrarErrorSupabase } from '../utils/equiposPiso'
import { validarEquipo } from '../utils/inventario'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { usePermissions } from '../hooks/usePermissions'
import { supabase } from '../services/supabaseClient'
import {
  eliminarAmbiente,
  eliminarPabellon,
  eliminarPiso,
  guardarAmbiente,
  guardarPabellon,
  guardarPiso,
  listarAmbientes,
  listarEquiposPiso,
  listarPabellones,
  listarPisos,
  type AmbienteUbicacion,
  type EquipoUbicacion,
  type Pabellon,
  type Piso,
} from '../services/ubicacionesService'
import { obtenerEquipo, cargarCatalogos, type Ambiente } from '../services/equiposService'
import { registrarMovimiento } from '../services/movimientosService'

type TipoFormulario = 'pabellon' | 'piso' | 'ambiente'

function mostrarError(error: unknown, defecto: string) {
  return error instanceof Error && error.message ? error.message : defecto
}

export default function Ubicaciones() {
  const { can } = usePermissions()
  const puedeAdministrar = can('ubicaciones.administrar')
  const puedeEditarEquipo = can('equipos.editar')
  const [pabellones, setPabellones] = useState<Pabellon[]>([])
  const [pisos, setPisos] = useState<Piso[]>([])
  const [ambientes, setAmbientes] = useState<AmbienteUbicacion[]>([])
  const [equipos, setEquipos] = useState<EquipoUbicacion[]>([])
  const [pabellonElegido, setPabellonElegido] = useState('')
  const [pisoElegido, setPisoElegido] = useState('')
  const [ambienteElegido, setAmbienteElegido] = useState('')
  const [catalogoAmbientes, setCatalogoAmbientes] = useState<Ambiente[]>([])
  const [cambioUbicacion, setCambioUbicacion] = useState({ abierto: false, equipoId: '', pabellonId: '', pisoId: '', ambienteId: '', guardando: false })
  const [ficha, setFicha] = useState<EquipoUbicacion | null>(null)
  const [formulario, setFormulario] = useState<TipoFormulario | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [numeroPiso, setNumeroPiso] = useState('')
  const [codigoAmbiente, setCodigoAmbiente] = useState('')
  const [tipoAmbiente, setTipoAmbiente] = useState('aula')
  const [pisoFormulario, setPisoFormulario] = useState('')
  const [activo, setActivo] = useState(true)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let vigente = true
    Promise.all([listarPabellones(), listarPisos(), listarAmbientes()])
      .then(([datosPabellones, datosPisos, datosAmbientes]) => {
        if (!vigente) return
        setPabellones(datosPabellones)
        setPisos(datosPisos)
        setAmbientes(datosAmbientes)
      })
      .catch((e: unknown) => {
        if (!vigente) return
        registrarErrorSupabase('No se pudieron cargar las ubicaciones', e)
        setError(mostrarError(e, 'No se pudieron cargar las ubicaciones.'))
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })

    const canal = supabaseCanal((tabla) => {
      if (tabla === 'equipos' || tabla === 'ambientes') {
        setRecarga((actual) => actual + 1)
      }
      void Promise.all([listarPabellones(), listarPisos(), listarAmbientes()])
        .then(([datosPabellones, datosPisos, datosAmbientes]) => {
          if (!vigente) return
          setPabellones(datosPabellones)
          setPisos(datosPisos)
          setAmbientes(datosAmbientes)
        })
        .catch((e: unknown) => {
          if (!vigente) return
          registrarErrorSupabase('No se pudieron actualizar las ubicaciones', e)
          setError(mostrarError(e, 'No se pudieron actualizar las ubicaciones.'))
        })
    })

    return () => {
      vigente = false
      void canal()
    }
  }, [])

  const pabellonActual =
    pabellones.find((pabellon) => pabellon.id === pabellonElegido) ??
    pabellones.find((pabellon) => pabellon.activo)
  const pisosPabellon = pisos.filter(
    (piso) => piso.pabellon_id === pabellonActual?.id,
  )
  const pisoActual =
    pisosPabellon.find((piso) => piso.id === pisoElegido) ??
    pisosPabellon.find((piso) => piso.activo)
  const pisoIdActual = `${pisoActual?.id ?? ''}`
  const ambientesPiso = ambientes.filter(
    (ambiente) => ambiente.piso_id === pisoActual?.id,
  )
  const ambientesVisibles = ambientesPiso.filter((ambiente) => ambiente.activo)
  const ambienteIdsPiso = useMemo(
    () => idsAmbientesDelPiso(ambientes, pisoIdActual),
    [ambientes, pisoIdActual],
  )
  const equiposVisibles = useMemo(
    () => filtrarEquiposUbicacion(equipos, busqueda, ambienteElegido, ambienteIdsPiso),
    [equipos, busqueda, ambienteElegido, ambienteIdsPiso],
  )
  const equiposPorAmbiente = useMemo(() => {
    const agrupados = new Map<string, EquipoUbicacion[]>()
    for (const equipo of equipos) {
      if (!equipo.ambiente_id || equipo.situacion !== 'activo') continue
      const lista = agrupados.get(equipo.ambiente_id) ?? []
      lista.push(equipo)
      agrupados.set(equipo.ambiente_id, lista)
    }
    return agrupados
  }, [equipos])

  useEffect(() => {
    if (!pisoIdActual) return

    let vigente = true
    Promise.all([
      listarEquiposPiso(ambienteIdsPiso),
      cargarCatalogos().catch((e: unknown) => {
        registrarErrorSupabase(
          'No se pudieron cargar los catálogos para ubicaciones',
          e,
        )
        return null
      }),
    ])
      .then(([datos, catalogos]) => {
        if (!vigente) return
        setEquipos(datos)
        if (catalogos?.ambientes) setCatalogoAmbientes(catalogos.ambientes)
        setError('')
      })
      .catch((e: unknown) => {
        if (!vigente) return
        registrarErrorSupabase('No se pudieron cargar los equipos del piso', e)
        setError(mostrarError(e, 'No se pudieron cargar los equipos del piso.'))
      })

    return () => {
      vigente = false
    }
  }, [pisoIdActual, ambienteIdsPiso, recarga])

  function abrirFormulario(
    tipo: TipoFormulario,
    registro?: Pabellon | Piso | AmbienteUbicacion,
  ) {
    setFormulario(tipo)
    setEditandoId(registro?.id ?? null)
    setError('')
    setAviso('')
    setActivo(registro?.activo ?? true)
    if (tipo === 'pabellon') {
      const item = registro as Pabellon | undefined
      setNombre(item?.nombre ?? '')
      setDescripcion(item?.descripcion ?? '')
    } else if (tipo === 'piso') {
      const item = registro as Piso | undefined
      setPisoFormulario(item?.pabellon_id ?? pabellonActual?.id ?? '')
      setNombre(item?.nombre ?? '')
      setNumeroPiso(item?.numero?.toString() ?? '')
    } else {
      const item = registro as AmbienteUbicacion | undefined
      setPisoFormulario(item?.piso_id ?? pisoActual?.id ?? '')
      setCodigoAmbiente(item?.codigo ?? '')
      setNombre(item?.nombre ?? '')
      setTipoAmbiente(item?.tipo ?? 'aula')
      setDescripcion(item?.descripcion ?? '')
    }
  }

  async function guardarUbicacion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!formulario) return
    setGuardando(true)
    setError('')
    try {
      if (formulario === 'pabellon') {
        await guardarPabellon(
          { nombre: nombre.trim(), descripcion: descripcion.trim() || null, activo },
          editandoId ?? undefined,
        )
      } else if (formulario === 'piso') {
        await guardarPiso(
          {
            pabellon_id: pisoFormulario,
            nombre: nombre.trim(),
            numero: numeroPiso ? Number(numeroPiso) : null,
            activo,
          },
          editandoId ?? undefined,
        )
        setPabellonElegido(pisoFormulario)
      } else {
        await guardarAmbiente(
          {
            piso_id: pisoFormulario,
            codigo: codigoAmbiente.trim(),
            nombre: nombre.trim(),
            tipo: tipoAmbiente.trim(),
            descripcion: descripcion.trim() || null,
            activo,
          },
          editandoId ?? undefined,
        )
        setPisoElegido(pisoFormulario)
      }

      const [datosPabellones, datosPisos, datosAmbientes] = await Promise.all([
        listarPabellones(),
        listarPisos(),
        listarAmbientes(),
      ])
      setPabellones(datosPabellones)
      setPisos(datosPisos)
      setAmbientes(datosAmbientes)
      setFormulario(null)
      setAviso('La ubicación se guardó correctamente.')
    } catch (e) {
      registrarErrorSupabase('No se pudo guardar la ubicación', e)
      setError(mostrarError(e, 'No se pudo guardar la ubicación.'))
    } finally {
      setGuardando(false)
    }
  }

  async function borrarUbicacion() {
    if (!formulario || !editandoId) return
    const etiqueta =
      formulario === 'pabellon'
        ? 'pabellón'
        : formulario === 'piso'
          ? 'piso'
          : 'ambiente'
    if (!window.confirm(`¿Eliminar este ${etiqueta}? Esta acción no se puede deshacer.`)) {
      return
    }

    setGuardando(true)
    setError('')
    setAviso('')
    try {
      if (formulario === 'pabellon') await eliminarPabellon(editandoId)
      else if (formulario === 'piso') await eliminarPiso(editandoId)
      else await eliminarAmbiente(editandoId)

      const [datosPabellones, datosPisos, datosAmbientes] = await Promise.all([
        listarPabellones(),
        listarPisos(),
        listarAmbientes(),
      ])
      setPabellones(datosPabellones)
      setPisos(datosPisos)
      setAmbientes(datosAmbientes)
      if (formulario === 'pabellon') {
        setPabellonElegido('')
        setPisoElegido('')
      } else if (formulario === 'piso') {
        setPisoElegido('')
      }
      setAmbienteElegido('')
      setFormulario(null)
      setAviso('La ubicación se eliminó correctamente.')
    } catch (e) {
      registrarErrorSupabase('No se pudo eliminar la ubicación', e)
      setError(mostrarError(e, 'No se pudo eliminar la ubicación.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Ubicaciones institucionales</h2>
          <p className="mt-1 text-sm text-slate-600">
            Explora pabellones, pisos y ambientes, y consulta los equipos de cada ubicación.
          </p>
        </div>
        {puedeAdministrar && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => abrirFormulario('pabellon')} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm">Agregar pabellón</button>
            <button type="button" disabled={!pabellonActual} onClick={() => abrirFormulario('piso')} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50">Agregar piso</button>
            <button type="button" disabled={!pisoActual} onClick={() => abrirFormulario('ambiente')} className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Agregar ambiente</button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {aviso && <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{aviso}</p>}

      <div className="mt-5 grid gap-3 rounded-xl bg-white p-4 shadow md:grid-cols-3">
        <label className="text-sm font-medium">Pabellón
          <select value={pabellonActual?.id ?? ''} onChange={(event) => { setPabellonElegido(event.target.value); setPisoElegido(''); setAmbienteElegido(''); setBusqueda('') }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
            {pabellones.filter((item) => item.activo || puedeAdministrar).map((item) => <option key={item.id} value={item.id}>{item.nombre}{item.activo ? '' : ' (inactivo)'}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Piso
          <select value={pisoActual?.id ?? ''} onChange={(event) => { setPisoElegido(event.target.value); setAmbienteElegido(''); setBusqueda('') }} disabled={!pisosPabellon.length} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100">
            {pisosPabellon.filter((item) => item.activo || puedeAdministrar).map((item) => <option key={item.id} value={item.id}>{item.nombre}{item.activo ? '' : ' (inactivo)'}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Ambiente
          <select value={ambienteElegido} onChange={(event) => { setAmbienteElegido(event.target.value); setBusqueda('') }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">Todos los ambientes del piso</option>
            {ambientesVisibles.map((item) => <option key={item.id} value={item.id}>{item.codigo} — {item.nombre}</option>)}
          </select>
        </label>
      </div>

      {puedeAdministrar && pabellonActual && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="mr-1 text-slate-500">Editar estructura:</span>
          <button type="button" onClick={() => abrirFormulario('pabellon', pabellonActual)} className="rounded border border-slate-300 px-3 py-1.5">Pabellón</button>
          {pisoActual && <button type="button" onClick={() => abrirFormulario('piso', pisoActual)} className="rounded border border-slate-300 px-3 py-1.5">Piso</button>}
          {ambientesPiso.map((ambiente) => (
            <button key={ambiente.id} type="button" onClick={() => abrirFormulario('ambiente', ambiente)} className="rounded border border-slate-300 px-3 py-1.5">
              Ambiente {ambiente.codigo}{ambiente.activo ? '' : ' (inactivo)'}
            </button>
          ))}
        </div>
      )}

      {pabellonActual && (
        <div className="mt-4 flex flex-wrap gap-2">
          {pisosPabellon.filter((piso) => piso.activo).map((piso) => (
            <button key={piso.id} type="button" onClick={() => { setPisoElegido(piso.id); setAmbienteElegido(''); setBusqueda('') }} className={`rounded-full px-4 py-2 text-sm font-medium ${pisoActual?.id === piso.id ? 'bg-blue-600 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>
              {piso.nombre}
            </button>
          ))}
        </div>
      )}

      {!cargando && (!pabellones.length || !pisos.length) && (
        <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          Aún no hay estructura institucional configurada. Un administrador puede crear pabellones, pisos y ambientes con los botones superiores.
        </p>
      )}

      {pisoActual && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-xl bg-white p-4 shadow">
              <p className="text-sm text-slate-500">Equipos activos en el piso</p>
              <p className="mt-1 text-2xl font-semibold">{equipos.filter((item) => item.situacion === 'activo').length}</p>
            </article>
            {(['operativo', 'con_fallas', 'en_mantenimiento', 'inoperativo', 'en_almacen'] as const).map((estado) => (
              <article key={estado} className="rounded-xl bg-white p-4 shadow">
                <p className="text-sm text-slate-500">{etiquetaEstado[estado]}</p>
                <p className="mt-1 text-2xl font-semibold">{equipos.filter((item) => item.situacion === 'activo' && item.estado_operativo === estado).length}</p>
              </article>
            ))}
          </div>

          <div className="mt-5">
            <section className="rounded-xl bg-white p-4 shadow">
              <h3 className="font-semibold">Ambientes del piso</h3>
              {ambientesVisibles.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No hay ambientes activos en este piso.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {ambientesVisibles.map((ambiente) => {
                    const lista = equiposPorAmbiente.get(ambiente.id) ?? []
                    return (
                      <li key={ambiente.id}>
                        <button type="button" onClick={() => { setAmbienteElegido(ambienteElegido === ambiente.id ? '' : ambiente.id); setBusqueda('') }} className={`w-full rounded-lg border p-3 text-left ${ambienteElegido === ambiente.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-medium">{ambiente.codigo} · {ambiente.nombre}</span>
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{lista.length} equipos</span>
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">{ambiente.tipo} · {lista.filter((item) => item.estado_operativo === 'operativo').length} operativos · {lista.filter((item) => item.estado_operativo !== 'operativo').length} con observaciones</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>

          <section className="mt-5 min-w-0 rounded-xl bg-white shadow">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
              <div>
                <h3 className="font-semibold">{ambienteElegido ? 'Equipos del ambiente' : 'Equipos del piso'}</h3>
                <p className="text-xs text-slate-500">La ubicación se obtiene de la relación del equipo con su ambiente.</p>
              </div>
              <span role="status" aria-live="polite" className="text-sm text-slate-500">{equiposVisibles.length} resultado(s) encontrado(s)</span>
            </div>
            <div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 text-sm font-medium text-slate-700" htmlFor="buscar-equipos-ubicacion">Buscar equipos en esta selección
                <input id="buscar-equipos-ubicacion" type="search" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Código, nombre, serie, marca, modelo o estado" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <button type="button" disabled={!busqueda} onClick={() => setBusqueda('')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50">Limpiar búsqueda</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr><th className="px-4 py-3">Código</th><th className="px-4 py-3">Equipo</th><th className="px-4 py-3">Ambiente</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acciones</th></tr>
                </thead>
                <tbody>
                  {equiposVisibles.map((equipo) => {
                    const ambiente = ambientes.find((item) => item.id === equipo.ambiente_id)
                    return (
                      <tr key={equipo.id} className="border-t">
                        <td className="px-4 py-3 font-semibold text-blue-800">{equipo.codigo_institucional}</td>
                        <td className="px-4 py-3">{equipo.nombre}<p className="text-xs text-slate-500">{equipo.marca ?? ''} {equipo.modelo ?? ''}</p></td>
                        <td className="px-4 py-3">{ambiente ? `${ambiente.codigo} — ${ambiente.nombre}` : '—'}</td>
                        <td className="px-4 py-3">{etiquetaEstado[equipo.estado_operativo] ?? equipo.estado_operativo}</td>
                        <td className="px-4 py-3"><button type="button" onClick={() => setFicha(equipo)} className="text-blue-700 underline">Ver equipo</button></td>
                      </tr>
                    )
                  })}
                  {equiposVisibles.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No se encontraron equipos</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {formulario && (
        <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
          <form onSubmit={(event) => void guardarUbicacion(event)} className="my-8 w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-xl font-semibold">{editandoId ? 'Editar' : 'Agregar'} {formulario === 'pabellon' ? 'pabellón' : formulario === 'piso' ? 'piso' : 'ambiente'}</h3>
            {formulario === 'piso' && <label className="mt-4 block text-sm">Pabellón
              <select required value={pisoFormulario} onChange={(event) => setPisoFormulario(event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
                {pabellones.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
              </select>
            </label>}
            {formulario === 'ambiente' && <label className="mt-4 block text-sm">Piso
              <select required value={pisoFormulario} onChange={(event) => setPisoFormulario(event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
                {pisos.map((item) => <option key={item.id} value={item.id}>{pabellones.find((pabellon) => pabellon.id === item.pabellon_id)?.nombre} — {item.nombre}</option>)}
              </select>
            </label>}
            {formulario === 'ambiente' && <label className="mt-4 block text-sm">Código del ambiente
              <input required maxLength={40} value={codigoAmbiente} onChange={(event) => setCodigoAmbiente(event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
            </label>}
            <label className="mt-4 block text-sm">{formulario === 'pabellon' ? 'Nombre del pabellón' : formulario === 'piso' ? 'Nombre del piso' : 'Nombre del aula, oficina o laboratorio'}
              <input required maxLength={100} value={nombre} onChange={(event) => setNombre(event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
            </label>
            {formulario === 'piso' && <label className="mt-4 block text-sm">Número del piso
              <input type="number" min={0} max={200} value={numeroPiso} onChange={(event) => setNumeroPiso(event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
            </label>}
            {formulario === 'ambiente' && <label className="mt-4 block text-sm">Tipo
              <select value={tipoAmbiente} onChange={(event) => setTipoAmbiente(event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
                <option value="aula">Aula</option><option value="oficina">Oficina</option><option value="laboratorio">Laboratorio</option>
              </select>
            </label>}
            {(formulario === 'pabellon' || formulario === 'ambiente') && <label className="mt-4 block text-sm">Descripción
              <textarea rows={2} maxLength={500} value={descripcion} onChange={(event) => setDescripcion(event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
            </label>}
            {editandoId && <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={activo} onChange={(event) => setActivo(event.target.checked)} /> Ubicación activa</label>}
            <div className="mt-5 flex justify-end gap-2">
              {editandoId && <button type="button" disabled={guardando} onClick={() => void borrarUbicacion()} className="mr-auto rounded border border-red-300 px-4 py-2 text-red-700 hover:bg-red-50 disabled:opacity-60">Eliminar</button>}
              <button type="button" disabled={guardando} onClick={() => setFormulario(null)} className="rounded border border-slate-300 px-4 py-2">Cancelar</button>
              <button type="submit" disabled={guardando || (formulario === 'piso' && !pabellones.length) || (formulario === 'ambiente' && !pisos.length)} className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60">{guardando ? 'Guardando...' : 'Guardar ubicación'}</button>
            </div>
          </form>
        </div>
      )}

      {ficha && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4">
          <section className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <p className="text-sm font-semibold text-blue-700">{ficha.codigo_institucional}</p>
            <h3 className="mt-1 text-xl font-semibold">{ficha.nombre}</h3>
            <dl className="mt-4 space-y-2 text-sm">
              <div><dt className="text-slate-500">Estado</dt><dd>{etiquetaEstado[ficha.estado_operativo] ?? ficha.estado_operativo}</dd></div>
              <div><dt className="text-slate-500">Categoría</dt><dd>{ficha.categoria?.nombre ?? '—'}</dd></div>
              <div><dt className="text-slate-500">Marca y modelo</dt><dd>{ficha.marca ?? '—'} {ficha.modelo ?? ''}</dd></div>
              <div><dt className="text-slate-500">Número de serie</dt><dd>{ficha.numero_serie ?? '—'}</dd></div>
              <div><dt className="text-slate-500">Ambiente</dt><dd>{ambientes.find((item) => item.id === ficha.ambiente_id)?.nombre ?? '—'}</dd></div>
            </dl>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {puedeEditarEquipo && (
                <button type="button" onClick={() => { setCambioUbicacion({ abierto: true, equipoId: ficha.id, pabellonId: pabellonActual?.id ?? '', pisoId: pisoActual?.id ?? '', ambienteId: ficha.ambiente_id ?? '', guardando: false }); setFicha(null) }} className="rounded border border-blue-200 px-3 py-2 text-sm text-blue-700">Cambiar ubicación</button>
              )}
              <Link to={`/equipos?equipo=${encodeURIComponent(ficha.id)}`} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Abrir ficha completa</Link>
              <button type="button" onClick={() => setFicha(null)} className="rounded border border-slate-300 px-4 py-2 text-sm">Cerrar</button>
            </div>
          </section>
        </div>
      )}

      {cambioUbicacion.abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Cambiar ubicación del equipo</h3>
            <p className="mt-1 text-sm text-slate-600">Selecciona nuevo pabellón, piso y ambiente. Se registrará el movimiento.</p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">Pabellón
                <select className="mt-1 w-full rounded border border-slate-300 px-3 py-2" value={cambioUbicacion.pabellonId} onChange={(e) => {
                  const pabId = e.target.value
                  setCambioUbicacion((a) => ({ ...a, pabellonId: pabId, pisoId: '', ambienteId: '' }))
                }}>
                  <option value="">Selecciona</option>
                  {pabellones.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </label>
              <label className="block text-sm">Piso
                <select className="mt-1 w-full rounded border border-slate-300 px-3 py-2" disabled={!cambioUbicacion.pabellonId} value={cambioUbicacion.pisoId} onChange={(e) => {
                  const pisoId = e.target.value
                  setCambioUbicacion((a) => ({ ...a, pisoId, ambienteId: '' }))
                }}>
                  <option value="">Selecciona</option>
                  {pisos.filter((p) => p.pabellon_id === cambioUbicacion.pabellonId).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </label>
              <label className="block text-sm">Ambiente
                <select className="mt-1 w-full rounded border border-slate-300 px-3 py-2" disabled={!cambioUbicacion.pisoId} value={cambioUbicacion.ambienteId} onChange={(e) => setCambioUbicacion((a) => ({ ...a, ambienteId: e.target.value }))}>
                  <option value="">Selecciona</option>
                  {catalogoAmbientes.filter((a) => a.piso_id === cambioUbicacion.pisoId).map((a) => <option key={a.id} value={a.id}>{a.codigo} — {a.nombre}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={cambioUbicacion.guardando} onClick={() => setCambioUbicacion({ abierto: false, equipoId: '', pabellonId: '', pisoId: '', ambienteId: '', guardando: false })} className="rounded border border-slate-300 px-4 py-2 text-sm">Cancelar</button>
              <button type="button" disabled={cambioUbicacion.guardando || !cambioUbicacion.ambienteId} onClick={async () => {
                if (!puedeEditarEquipo) return
                setCambioUbicacion((a) => ({ ...a, guardando: true }))
                try {
                  const [equipo, catalogos] = await Promise.all([obtenerEquipo(cambioUbicacion.equipoId), cargarCatalogos()])
                  const errores = validarEquipo({ ...equipo, ambiente_id: cambioUbicacion.ambienteId }, catalogos)
                  if (Object.keys(errores).length) throw new Error(`${Object.values(errores).join(' ')} Completa la ficha del equipo antes de trasladarlo.`)
                  const fecha = new Date()
                  await registrarMovimiento({
                    equipoId: equipo.id,
                    ambienteDestinoId: cambioUbicacion.ambienteId,
                    responsableNuevoId: equipo.responsable_id,
                    posicionNueva: equipo.posicion,
                    fecha: new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000).toISOString().slice(0, 10),
                    motivo: 'Traslado desde ubicaciones',
                  })
                  setCambioUbicacion({ abierto: false, equipoId: '', pabellonId: '', pisoId: '', ambienteId: '', guardando: false })
                  if (pisoIdActual) { const datos = await listarEquiposPiso(ambienteIdsPiso); setEquipos(datos); }
                } catch (e) {
                  registrarErrorSupabase('No se pudo cambiar la ubicación', e)
                  setError(mostrarError(e, 'No se pudo cambiar la ubicación.'))
                  setCambioUbicacion((a) => ({ ...a, guardando: false }))
                }
              }} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{cambioUbicacion.guardando ? 'Guardando...' : 'Confirmar traslado'}</button>
            </div>
          </div>
        </div>
      )}

      {cargando && <p className="mt-4 text-sm text-slate-500">Cargando estructura institucional...</p>}
    </section>
  )
}

function supabaseCanal(
  alCambiar: (tabla: string) => void,
): () => Promise<void> {
  const canal = supabaseClientChannel()
    .on('postgres_changes', { event: '*', schema: 'public', table: 'equipos' }, () => alCambiar('equipos'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ambientes' }, () => alCambiar('ambientes'))
    .subscribe()
  return async () => {
    await canal.unsubscribe()
  }
}

function supabaseClientChannel() {
  return supabase.channel('ubicaciones-institucionales')
}
