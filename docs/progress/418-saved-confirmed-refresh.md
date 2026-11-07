# #418 — Formulario y confirmación de guardadas

Base `main` #422 (`6d94f31`), independiente de Insights y #399. Reproducción automatizada: con el detalle del catálogo retenido después de escribir, aparecían «Actualizar catálogo confirmado» y «Cerrar · conservar intento» antes de cualquier fallo.

`reconciling` identifica la confirmación conocida mientras se conserva el recibo y se leen detalle/lista. El formulario queda bloqueado y no ofrece recuperación transitoria; ante error real mantiene recibo y borrador, con recuperación explícita que no reenvía la mutación. Rechazos de red del detalle y errores locales conservan el resultado conocido. No hay demoras artificiales ni cambios de CAS, idempotencia o almacenamiento.

Se retira solo la aclaración visual de vacío/cero; parser y escritura conservan null frente a cero. La fila compartida de bibliotecas reserva espacio horizontal y radio constantes, con fondo solo al resaltar: no cambia de tamaño ni convierte la lista en tarjetas.

Validación: 40 pruebas dirigidas únicas de editor, controlador y biblioteca; fases retenidas de detalle/lista, éxito/fallo/rechazo, reintento sin escritura repetida, almacenamiento, geometría de resaltado, null/cero y conflictos. Tipos y lint Mobile aprobados. Validación completa combinada al cerrar la tanda. Sin build ni QA física: [checklist única](367-qa-fisica.md). Issue sigue abierto.
