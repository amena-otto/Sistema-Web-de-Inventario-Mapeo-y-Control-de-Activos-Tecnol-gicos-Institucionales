# Etiquetas QR institucionales compactas

La etiqueta predeterminada mide **90 × 35 mm**. La altura se puede cambiar a 40 o 45 mm en el diálogo, conservando siempre 90 mm de ancho. Una única imagen completa se utiliza en vista previa, PNG e impresión.

## Diseño y recursos

- El logotipo oficial se carga desde `public/logo-otto-tonsmann.png` o desde el recurso existente `public/publiclogo-otto-tonsmann.png`. Se elimina únicamente su margen blanco al dibujarlo; el escudo conserva su proporción y no se recrea.
- También se puede cargar la referencia completa: se toma su escudo original, pero la tarjeta se recompone para eliminar el espacio vacío que contenía el fondo. El resto utiliza fondo blanco, azul oscuro, esquinas redondeadas y ondas amplias amarillas y azules.
- El encabezado queda junto al escudo. Nombre y código se dibujan consecutivamente, con una separación de 1 mm, a la izquierda del QR. La fuente y los saltos de línea se ajustan al contenido; el código sigue al alto real del nombre. Si no cabe con tipografía legible, se solicita mayor altura y no se imprime un lote incompleto.
- Los datos proceden del registro seleccionado y se editan en la ficha de inventario. No hay datos ficticios ni cambios en permisos o autenticación.
- `VITE_APP_URL` conserva el origen HTTPS publicado, sin rutas, parámetros ni credenciales. El QR apunta a `/equipos?equipo=UUID`.

## Impresión y PNG

| Etiqueta | Distribución A4 horizontal | Máximo por página | Márgenes verticales |
|---|---|---|---|
| 90 × 35 mm | 3 columnas × 5 filas | 15 | 11.5 mm |
| 90 × 40 mm | 3 columnas × 4 filas | 12 | 20.5 mm |
| 90 × 45 mm | 3 columnas × 4 filas | 12 | 10.5 mm |

Las filas se calculan desde la altura disponible de A4. Los márgenes laterales son 9.5 mm, las separaciones horizontales 4 mm y las verticales 3 mm. Se conservan contornos punteados de recorte y saltos entre hojas completas; no se usa escalado CSS.

Cada PNG tiene 1080 píxeles de ancho y 420, 480 o 540 de alto (12 píxeles/mm). Desde otra aplicación, indica el tamaño físico al imprimir: el metadato de resolución del PNG puede variar según el navegador.

Selecciona **A4 horizontal, 100 % / tamaño real** y desactiva encabezados y pies del navegador. Las opciones del controlador pueden prevalecer sobre CSS; comprueba la vista previa y realiza una prueba física antes de utilizar papel de etiquetas.

El botón QR permite impresión individual. La selección en tarjetas/tabla permite impresión masiva y se conserva entre páginas y filtros. «Seleccionar esta página» afecta únicamente los registros visibles.

Pruebas de lógica: `npm test`. No ejecutan escrituras en Supabase.
