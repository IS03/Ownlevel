# #399 — Guardado confirmado y relectura

Base `main` #422 (`6d94f31`), sin dependencia de las entregas de Insights. Reproducción automatizada: mantener pendiente la segunda lectura de Cuerpo después de un recibo exitoso mostraba «Actualizar lectura» y apagaba el indicador ocupado antes de cualquier fallo.

El controlador distingue ahora `reconciling` (recibo confirmado, persistencia/relectura en curso) de `confirmed` (requiere recuperación). Peso y medidas conservan el indicador ocupado y el bloqueo transitorio hasta completar el flujo. El recibo y borrador no se eliminan antes de la relectura; recuperar un recibo nunca envía la escritura. Fallos de almacenamiento posteriores a la confirmación conservan el intento y no dicen que no se envió nada.

Validación dirigida: 32 pruebas únicas de controlador, pantalla, fecha exacta y acceso al editor; incluye relectura retenida con éxito/fallo y errores al persistir/limpiar un recibo confirmado. Tipos y lint Mobile aprobados. Sin cambios backend/contratos/journal, demoras artificiales, build ni QA física. Checklist única: [QA física](367-qa-fisica.md). Issue permanece abierto.

Combinación local no publicada `654a0c9` con #423/#424/#426: una sola validación completa; tipos/lint aprobados, 1.698 pruebas pasan y una del dock falla (205 suites). Config check separado aprobado. Las 69 pruebas relacionadas del dock pasan tanto en main `6d94f31` como en combinación: causa no acreditada, sin atribuir a main ni aprobar el gate global. No se cambiaron timeouts/expectativas. Esto no equivale a QA física de #399.
