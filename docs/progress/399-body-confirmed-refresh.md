# #399 — Guardado confirmado y relectura

Base `main` #422 (`6d94f31`), sin dependencia de las entregas de Insights. Reproducción automatizada: mantener pendiente la segunda lectura de Cuerpo después de un recibo exitoso mostraba «Actualizar lectura» y apagaba el indicador ocupado antes de cualquier fallo.

El controlador distingue ahora `reconciling` (recibo confirmado, persistencia/relectura en curso) de `confirmed` (requiere recuperación). Peso y medidas conservan el indicador ocupado y el bloqueo transitorio hasta completar el flujo. El recibo y borrador no se eliminan antes de la relectura; recuperar un recibo nunca envía la escritura. Fallos de almacenamiento posteriores a la confirmación conservan el intento y no dicen que no se envió nada.

Validación dirigida: 32 pruebas únicas de controlador, pantalla, fecha exacta y acceso al editor; incluye relectura retenida con éxito/fallo y errores al persistir/limpiar un recibo confirmado. Tipos y lint Mobile aprobados. Validación completa de la combinación al cerrar la tanda. Sin cambios backend/contratos/journal, demoras artificiales, build ni QA física. Checklist única: [QA física](367-qa-fisica.md). Issue permanece abierto.
