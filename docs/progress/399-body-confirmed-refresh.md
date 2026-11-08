# #399 — Guardado confirmado y relectura

Base `main` #422 (`6d94f31`), sin dependencia de las entregas de Insights. Reproducción automatizada: mantener pendiente la segunda lectura de Cuerpo después de un recibo exitoso mostraba «Actualizar lectura» y apagaba el indicador ocupado antes de cualquier fallo.

El controlador distingue ahora `reconciling` (recibo confirmado, persistencia/relectura en curso) de `confirmed` (requiere recuperación). Peso y medidas conservan el indicador ocupado y el bloqueo transitorio hasta completar el flujo. El recibo y borrador no se eliminan antes de la relectura; recuperar un recibo nunca envía la escritura. Fallos de almacenamiento posteriores a la confirmación conservan el intento y no dicen que no se envió nada.

Validación dirigida: 32 pruebas únicas de controlador, pantalla, fecha exacta y acceso al editor; incluye relectura retenida con éxito/fallo y errores al persistir/limpiar un recibo confirmado. Tipos y lint Mobile aprobados. Sin cambios backend/contratos/journal, demoras artificiales, build ni QA física. Checklist única: [QA física](367-qa-fisica.md). Issue permanece abierto.

Combinación local no publicada `654a0c9` con #423/#424/#426: una sola validación completa; tipos/lint aprobados, 1.698 pruebas pasan y una del dock falla (205 suites). Config check separado aprobado. Las 69 pruebas relacionadas del dock pasan tanto en main `6d94f31` como en combinación: causa no acreditada, sin atribuir a main ni aprobar el gate global. No se cambiaron timeouts/expectativas. Esto no equivale a QA física de #399.


## Seguimiento #436 — salida de la hoja después de guardar (08/11/2026)

El controlador termina correctamente: persiste el recibo, relee y limpia editor/intento. El problema de presentación era que `BodyEditors` dejaba de renderizar `WeightEditorSheet` al recibir `editor: null`, antes de solicitar la salida de `AppSheet`. La regresión con escritura/relectura retenidas falla en main al perder el campo, y pasa conservando el mismo formulario bloqueado hasta `onClosed` nativo y el dismiss del Modal. No se modifican controlador, journal, API ni reglas de confirmación.

Observación adicional en iPhone 18 Pro simulado / iOS 27.0, app Dev existente y un fixture EJEMPLO aislado: API y journal solo en memoria, sin AuthProvider, cliente de API real, build o instalación. Mismo controlador y presentación de producción antes/después; una escritura sintética y dos lecturas de overview por caso. El guardado se libera explícitamente desde un colector local después de aparecer el teclado, sin temporizador en el arreglo.

| Momento desde que el controlador limpia el editor | Main | Arreglo |
| --- | --- | --- |
| Solicitud de salida | no ocurre | 11,824 ms |
| Fin del cierre nativo | no ocurre | 371,712 ms |
| Dismiss del Modal | no ocurre | 403,668 ms |
| Desmontaje de la hoja | 4,571 ms | 408,384 ms |

Son los tiempos observados de un solo caso, no umbrales ni una garantía temporal. El arreglo usa el cierre existente, incluida su coordinación con el teclado y Reducir movimiento; no agrega delays, alturas, animaciones propias ni un nuevo método de guardado. El formulario retenido no queda editable, y se descarta al cambiar controlador/usuario. Medidas y otras hojas conservan su recorrido.

Regresiones: orden de cierre con/sin Reducir movimiento, bloqueo de reenvío al salir, reapertura posterior, aislamiento de controlador y relectura fallida recuperable sin otra escritura. 53 pruebas dirigidas de pantalla/controlador/hoja/entrada desde Inicio aprobadas. Todos los hooks y la entrada temporal se retiraron; clips y traza quedaron solo en los artefactos locales de esta revisión (`ownlevel-435-436-20261108`). El Metro original se mantuvo activo y Dev volvió a él. La checklist única contiene el pendiente físico de #436; la observación del simulador no aprueba iPhone, VoiceOver ni toda la matriz de fechas/red/teclado.
