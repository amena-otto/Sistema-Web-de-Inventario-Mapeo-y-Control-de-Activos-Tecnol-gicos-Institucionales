# Componentes y activos relacionados

## 1. Objetivo y alcance

Documentar las características técnicas almacenadas en `componentes` y las
asociaciones entre activos en `relaciones_equipos`. No son una pantalla
independiente: se gestionan desde la ficha de [Equipos](./equipos.md).

## 2. Funcionalidades implementadas

- Registrar y editar componentes técnicos del equipo: tipo, marca, modelo,
  capacidad, número de serie y observaciones.
- Tipos sugeridos por la interfaz: Procesador, Memoria RAM, Almacenamiento y
  Sistema operativo. El campo `tipo` es texto; la lista es una ayuda, no una
  restricción de la base de datos.
- Asociar otros equipos como activos relacionados desde la ficha, indicando el
  tipo de relación.
- Consultar ambos listados al abrir el detalle de un equipo.

## 3. Flujo de funcionamiento

1. Se abre la ficha de un equipo desde el listado o desde un QR.
2. La sección de información técnica carga `componentes` y
   `relaciones_equipos` para ese activo.
3. Admin o técnico agrega/edita componentes y vínculos; el guardado es
   explícito desde el formulario correspondiente.
4. Los cambios quedan registrados por los disparadores de auditoría de ambas
   tablas.

## 4. Roles y permisos

| Operación | Admin | Técnico | Consulta |
|---|---|---|---|
| Leer componentes y relaciones | Sí | Sí | Sí |
| Crear, editar y borrar componentes | Sí | Sí | No |
| Crear y borrar relaciones | Sí | Sí | No |

Según `usePermissions.ts`, `equipos.editar` corresponde a admin y técnico;
RLS refuerza estas operaciones en `004_modulo_inventario.sql`.

## 5. Formularios y campos

`Componente`: `tipo` (obligatorio en la interfaz), `marca`, `modelo`,
`capacidad`, `numero_serie`, `observaciones`.

`RelacionEquipo`: `equipo_principal_id`, `equipo_relacionado_id`,
`tipo_relacion`.

## 6. Validaciones y reglas de negocio

- Los componentes pertenecen a un único equipo mediante `componentes.equipo_id`.
- Las relaciones referencian dos equipos por ID; la interfaz ofrece el catálogo
  de activos existentes.
- No hay una regla documentada de reciprocidad automática: el vínculo se crea
  tal como se guarda desde la ficha principal.

## 7. Estados y transiciones

No aplica: no hay estados propios en estas tablas.

## 8. Integración con otros módulos

- [Equipos](./equipos.md): los componentes se muestran en la ficha y los
  activos relacionados permiten navegar entre activos.
- [Reportes](./reportes.md): el historial de mantenimientos exportado incluye
  los componentes reemplazados registrados en la intervención, campo distinto
  de `componentes`.
- [Base de datos](../base-datos/01-estructura-tablas.md): tablas y migración 004.

## 9. Tablas y funciones utilizadas

`componentes`, `relaciones_equipos`. No hay RPC propias; el acceso es
PostgREST con políticas RLS. Véase
[relaciones y restricciones](../base-datos/02-relaciones-y-restricciones.md).

## 10. Archivos principales del código

- `src/services/equiposService.ts` — tipos `Componente` y `RelacionEquipo`,
  funciones `guardarComponente`, `guardarRelacion` y carga del detalle.
- `src/pages/Equipos.tsx` — sección «Información técnica» y selector de activos
  relacionados.

## 11. Filtros, búsquedas, indicadores y reportes

No tiene filtros ni indicadores propios.

## 12. Limitaciones conocidas

- Los tipos de componente no son un catálogo gestionable desde la interfaz.
- El campo de componentes reemplazados en mantenimientos es texto libre y no
  actualiza automáticamente esta tabla.

## 13. Pruebas realizadas y pendientes

- **Pendientes en staging:** creación, edición y lectura de componentes y
  relaciones con cada rol; comprobación de la auditoría generada.
- No se registraron resultados de pruebas específicas para este módulo en los
  informes históricos disponibles.

## 14. Referencias

- [Equipos](./equipos.md)
- [Estructura de tablas](../base-datos/01-estructura-tablas.md)
