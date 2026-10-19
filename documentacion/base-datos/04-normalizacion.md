# 04. Normalización de la base de datos

## 1. Objetivo
La normalización busca organizar la información del Sistema Web de Inventario, Mapeo y Control de Activos Tecnológicos Institucionales para reducir la duplicación de datos, evitar inconsistencias y mantener la integridad de la información.

## 2. Primera Forma Normal (1FN)
Las tablas se estructuran mediante registros individuales y campos definidos para cada atributo. Las relaciones entre equipos, componentes, ubicaciones, mantenimientos y fotografías se representan mediante tablas relacionadas, evitando almacenar múltiples registros independientes dentro de un mismo campo.

## 3. Segunda Forma Normal (2FN)
Las tablas utilizan claves primarias para identificar sus registros. Los atributos descriptivos se almacenan en las entidades a las que corresponden, procurando que cada atributo dependa de la clave que identifica al registro.

En las tablas que utilizan claves compuestas, se debe verificar que los atributos no clave dependan de la totalidad de dicha clave.

## 4. Tercera Forma Normal (3FN)
La información se separa según su naturaleza y responsabilidad:

- `pabellones`, `pisos` y `ambientes` organizan la jerarquía de ubicaciones.
- `categorias_equipos` centraliza la clasificación de los activos.
- `equipos` contiene la información principal de cada activo.
- `componentes` registra las características de los componentes tecnológicos.
- `relaciones_equipos` representa las asociaciones entre equipos.
- `mantenimientos` y `movimientos` conservan el historial de operaciones.
- `fotografias_equipos` mantiene las referencias a las fotografías.
- `profiles` administra los perfiles institucionales.
- `auditoria` conserva el registro de cambios.

Esta separación permite evitar la repetición innecesaria de datos descriptivos y facilita el mantenimiento de la información.

## 5. Integridad y prevención de duplicados
Las claves primarias, claves foráneas, restricciones de unicidad y validaciones definidas en el esquema contribuyen a mantener la integridad de los registros. El código institucional de cada equipo debe ser único y los números de serie deben tener las restricciones correspondientes cuando aplique.

## 6. Conclusión
El modelo adopta una estructura relacional orientada a las tres primeras formas normales. La separación de entidades y el uso de relaciones permiten reducir redundancias y conservar la consistencia de la información.

La conformidad definitiva con 1FN, 2FN y 3FN debe validarse con la estructura y las dependencias funcionales reales de todas las tablas.

Importante: esta documentación describe el criterio de diseño, pero no demuestra por sí sola que todas las tablas cumplen las tres formas normales. Esa confirmación requiere revisar el esquema real.
