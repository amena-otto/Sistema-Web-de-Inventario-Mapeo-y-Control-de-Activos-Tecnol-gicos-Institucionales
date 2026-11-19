# Etiquetas QR institucionales

El módulo de etiquetas genera una imagen completa por equipo con el logotipo institucional, nombre, código, serie y un código QR que abre la ficha del inventario. La misma imagen se utiliza en vista previa, descarga PNG e impresión.

## Formato

La etiqueta predeterminada mide **90 × 35 mm**. El diálogo permite cambiar la altura a 40 o 45 mm, conservando siempre 90 mm de ancho.

| Altura | Distribución A4 horizontal | Máximo por hoja | Margen vertical |
|---|---|---|---|
| 90 × 35 mm | 3 columnas × 5 filas | 15 | 11.5 mm |
| 90 × 40 mm | 3 columnas × 4 filas | 12 | 20.5 mm |
| 90 × 45 mm | 3 columnas × 4 filas | 12 | 10.5 mm |

Los márgenes laterales son 9.5 mm, la separación horizontal 4 mm y la vertical 3 mm. Las filas se calculan a partir de la altura disponible de A4. Se conservan los contornos punteados de recorte y los saltos entre hojas completas; no se usa escalado CSS de las imágenes.

Cada PNG mide 1080 píxeles de ancho y 420, 480 o 540 de alto, según la altura seleccionada (12 píxeles por milímetro). Al imprimir el PNG desde otra aplicación debe indicarse el tamaño físico, porque el metadato de resolución puede variar según el navegador.

## Contenido y recursos

- El logotipo oficial se carga desde `public/logo-otto-tonsmann.png` o desde `public/publiclogo-otto-tonsmann.png`. Solo se recorta su margen blanco al dibujarlo; el escudo conserva su proporción.
- El diálogo permite cargar una referencia institucional completa en PNG, JPG o WebP de hasta 10 MB y proporción cercana a 2:1. Se toma el escudo original y se recompone la tarjeta para eliminar el espacio vacío del fondo.
- El encabezado muestra `INSTITUTO OTTO TONSMANN`. Nombre, código y serie se dibujan como bloque consecutivo a la izquierda del QR. El código sigue al alto real del nombre, sin reservar un espacio fijo.
- La tipografía y los saltos de línea se ajustan al contenido. Si el texto no cabe con tamaño legible, se solicita una altura mayor y no se imprime un lote incompleto.
- Los datos salen del registro seleccionado y se editan en la ficha de inventario. No hay datos ficticios ni cambios en permisos o autenticación.

## Enlace del QR

`crearUrlFicha` exige que `VITE_APP_URL` contenga únicamente el origen HTTPS publicado: sin `localhost`, rutas, parámetros, fragmentos, usuario ni contraseña. El QR apunta a `/equipos?equipo=UUID`.

La generación usa corrección de errores alta, margen 4 y color azul institucional sobre blanco. Si la URL es demasiado extensa para un QR legible, la operación se detiene con un mensaje.

## Impresión y descarga

El botón **QR** de la ficha permite la impresión individual. La selección en las vistas de tarjetas o tabla permite la impresión masiva y se conserva entre páginas y filtros. «Seleccionar esta página» afecta únicamente a los registros visibles.

El diálogo muestra el número de hojas, permite descargar cada PNG y ofrece enlaces para comprobar cada URL. Antes de imprimir hay que elegir **A4 horizontal**, **100 % / tamaño real** y desactivar encabezados y pies del navegador. Las opciones del controlador pueden prevalecer sobre la configuración CSS, por lo que debe revisarse la vista previa y hacerse una prueba física antes de usar papel de etiquetas.

## Puntos de validación

- El UUID, nombre y código institucional son obligatorios para generar la etiqueta.
- Si no se encuentra el logotipo, el espacio queda reservado y se muestra un aviso antes de imprimir las etiquetas definitivas.
- El número de serie se muestra como «Sin serie» cuando no existe.
- Las pruebas de lógica se ejecutan con `npm test` y no realizan escrituras en Supabase.

## Fuentes

- `docs/etiquetas-qr.md`
- `src/components/EquipoQrDialog.tsx`
- `src/utils/etiquetasQr.ts`
- `src/utils/dibujarEtiquetaQr.ts`
