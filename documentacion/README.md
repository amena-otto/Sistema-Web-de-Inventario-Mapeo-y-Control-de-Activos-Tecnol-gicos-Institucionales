# Índice documental

Documentación del Sistema Web de Inventario, Mapeo y Control de Activos
Tecnológicos Institucionales. El [README principal](../README.md) es el punto
de entrada al repositorio; este archivo ordena todo el material documental.

La documentación describe la implementación existente en este repositorio
(código fuente y migraciones SQL). Cuando una fuente antigua discrepaba del
código, se documentó el comportamiento real y se registró la diferencia en
[discrepancias conocidas](./discrepancias-conocidas.md).

## Módulos funcionales

| Documento | Qué permite localizar |
|---|---|
| [dashboard](./modulos/dashboard.md) | Indicadores del inicio, distribución por pabellón/piso/ambiente, filtros y reglas de visualización de mantenimiento |
| [equipos](./modulos/equipos.md) | Alta y edición de activos, búsqueda, filtros, paginación, estados, baja, fotografías y características técnicas |
| [componentes](./modulos/componentes.md) | Características técnicas y activos relacionados desde la ficha |
| [ubicaciones](./modulos/ubicaciones.md) | Pabellones, pisos, oficinas, aulas, laboratorios, catálogos y eliminación segura |
| [mantenimientos](./modulos/mantenimientos.md) | Prevención/corrección, técnicos, estados, transiciones, historial, indicadores y permisos |
| [movimientos](./modulos/movimientos.md) | Traslados, responsables y trazabilidad inmutable |
| [equipos compartidos](./modulos/equipos-compartidos.md) | Áreas usuarias, vínculos, visualización por oficina y reglas de la RPC 020 |
| [etiquetas QR](./modulos/etiquetas-qr.md) | Diseño, tamaños, descarga PNG, impresión individual y masiva |
| [reportes](./modulos/reportes.md) | Nueve reportes, exportación CSV/XLSX e importación masiva |
| [usuarios y permisos](./modulos/usuarios-permisos.md) | Roles, matriz de permisos, sesión, invitaciones, correo y contraseñas |
| [baja definitiva de equipos](./modulos/baja-definitiva-equipos.md) | Purgación exclusiva de administrador, constancia y limpieza de archivos |

## Base de datos y arquitectura

| Documento | Contenido |
|---|---|
| [01 · Estructura de tablas](./base-datos/01-estructura-tablas.md) | Inventario de tablas, columnas relevantes y qué hace cada migración |
| [02 · Relaciones y restricciones](./base-datos/02-relaciones-y-restricciones.md) | Foreign keys, unicidad, CHECK e índices |
| [03 · Seguridad, RLS y auditoría](./base-datos/03-seguridad-rls-y-auditoria.md) | Políticas, disparadores, RPC y escrituras bloqueadas |
| [04 · Normalización](./base-datos/04-normalizacion.md) | Criterio de diseño 1FN–3FN y su alcance |
| [05 · Modelo entidad-relación](./base-datos/05-modelo-entidad-relacion.md) | Diagrama disponible y relaciones principales |

El diagrama `diagrama-er.jpg` se conserva junto a estos documentos.

## Operaciones

| Documento | Contenido |
|---|---|
| [Configuración de autenticación](./operaciones/configuracion-autenticacion.md) | Auth, redirecciones, secretos y despliegue de Edge Functions de usuarios |
| [Publicación y operaciones](./operaciones/despliegue.md) | Compilación, Cloudflare Workers y orden de migraciones |
| [Respaldos y restauración local](./operaciones/respaldos-restauracion.md) | Copia cifrada, verificación, programación y límites |
| [Despliegue controlado de la estabilización](./operaciones/despliegue-eliminacion-equipos.md) | Registro del 7 de noviembre de 2026: migraciones 015–017 y comprobaciones previas |

## Pruebas

- [Plan de pruebas y verificaciones](./pruebas/plan-pruebas.md): matrices por
  módulo, RLS, restauración, CI y consumo del plan. Distingue verificaciones
  automatizables de las pendientes en staging.

## Histórico

- [Auditoría de cierre (25 de octubre de 2026)](./historico/auditoria-cierre-2026-10-25.md):
  matrices RB/CA, hallazgos, evidencia local y veredicto de esa entrega.
- [Entrega de oficinas independientes](./historico/entrega-oficinas-independientes.md):
  alcance de la rama `feat/ubicaciones-oficinas` y comprobaciones de aquella versión.
- [Entrega de interfaz y equipos compartidos](./historico/entrega-equipos-compartidos.md):
  alcance de la rama `feat/interfaz-equipos-compartidos` y resultado de pruebas de esa entrega.

Los informes históricos conservan cifras y fechas originales; no se reinterpretan
como estado actual del sistema.

## Convenciones

- Nombres de archivo en minúsculas y con guiones.
- Documentación funcional separada de arquitectura, procedimientos, pruebas e
  historial.
- Los documentos funcionales explican qué hace una tabla o función y enlazan a
  la especificación técnica; no copian consultas SQL completas.
- `docs/verificar_datos.sql` permanece en su ruta original y no se modifica.
