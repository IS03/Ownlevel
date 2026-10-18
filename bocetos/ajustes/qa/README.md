# Ajustes · QA del 18 de octubre de 2026

Rama `codex/ajustes-qa`, desde `origin/main`. iPhone 18 Pro, iOS 27, development build y Metro 8081 en la carpeta principal. Sin cambios de servidor, contratos, controllers, CAS ni claves de idempotencia.

## Recorrido y correcciones

| Pantalla | Revisado | Hallazgo y cambio |
|---|---|---|
| Ajustes | Titular, resúmenes, avatar, entradas, carga inicial y caché; claro y oscuro, letra normal y grande | Al faltar altura/peso se agregaban unidades a «Sin dato». Ahora solo acompañan valores presentes. Los renglones de texto anuncian también su valor, no solo el título. |
| Cuenta | Foto, nombre, email y proveedor; claro/oscuro y letra grande | El proveedor desconocido producía «Tu cuenta de tu cuenta». Ahora dice «Tu cuenta conectada», sin inventar Google/Apple. No se guardó el nombre ni se cerró sesión. |
| App | Tema del sistema, controles nativos y vibración; claro/oscuro y letra grande | Sin cambio específico. Las preferencias de tema y vibración de la cuenta no se cambiaron: se cambió la apariencia del simulador. |
| Energía | Modo propio existente, valor, actividad en palabras y extra desplegable; claro/oscuro y letra grande | El contenedor editorial ajusta el espacio del teclado y permite bajarlo al desplazar. No se cambió ni guardó el gasto. El cálculo automático/faltantes/conflictos queda cubierto por los tests existentes, no por una escritura real. |
| Datos físicos | Nacimiento, sexo en palabras, rueda de altura abierta sin cambiarla, último peso y enlace a Cuerpo; claro/oscuro y letra grande | Renglones accesibles con el valor actual y ajuste del teclado compartido. No se guardó ningún dato físico ni peso. |
| Etapas | Estado vacío real, entradas de acciones y previsualización; claro/oscuro y letra grande | «ANTES» quedaba sin explicación cuando no había pasadas. Ahora explica que las etapas anteriores aparecerán ahí. Los pares nombre/objetivo se apilan con letra grande. |
| Cambiar el plan | Acciones y planes típicos, sin escribir al servidor | Mismas rutas y reglas. Solo se abrieron formularios locales para inspección. |
| Programar etapas | Plantilla Volumen y definición, fechas, nombre, objetivos sugeridos y controles; sin confirmar | Con letra grande el total se iba por el borde y el tipo se partía letra por letra. Los pares se apilan; el nombre tiene interlineado/altura suficientes. Duración: número y unidad en un mismo texto para no desbordar los botones. |
| Plan por día / Cambiar un día | Apertura y cancelación, días con datos faltantes, campos y aplicación local cubierta por tests | Encabezado con controles de ícono accesibles de 44 pt, título flexible, campos apilados con letra grande e interlineado/altura correctos. Columnas más anchas al crecer la letra, sin inventar barras. Hoja limitada al alto visible y desplazable. El teclado se descarta al comenzar el cierre y no se aplica al cancelar. Agua/extras se formatean como en pantalla. |
| Métricas | Lista, crear, editar, reordenar mediante acciones accesibles, carga rápida en Inicio y archivar | En edición, el texto del menú ocupaba el ancho y ocultaba el título incluso con letra normal. Cruz y menú son controles de vidrio con etiqueta accesible; el título dispone del ancho restante. Campos de duración apilados con letra grande, cuerpo desplazable y cierre que descarta el teclado desde el inicio. |
| Eliminar cuenta | Información, campo vacío, botón deshabilitado y salida; claro/oscuro y letra grande | Sin cambios a la eliminación. Nunca se escribió ELIMINAR, se confirmó ni se llamó a la escritura. |
| Diagnóstico | Lectura existente de Inicio, estado, respuesta, tiempo, última comprobación y reintento | Tarjetas/etiquetas internas en inglés y carga suelta reemplazadas por renglones editoriales, castellano, esqueleto y botón con indicador. Mismo GET y misma restricción a desarrollo. Título adaptable para no dejar una letra sola con tamaño accesible. |
| Encabezados / navegación | Stack de Ajustes y enlaces de Nutrición: Plan → Etapas, Energía y Datos físicos activados y destinos comprobados | Métricas y Diagnóstico tenían encabezados opacos que cortaban el resplandor: ahora usan la misma configuración transparente que el resto del stack. |

## Evidencia principal

- Perfil: [antes](cuenta-claro-normal-antes.png) · [después en oscuro y letra grande](cuenta-oscuro-grande-despues.png).
- Editor de métrica, título oculto en tamaño normal: [antes](editor-metrica-claro-normal-antes.png) · [después](editor-metrica-claro-normal-despues.png).
- Editor de métrica, tamaño accesible: [antes](editor-metrica-oscuro-grande-antes.png) · [después](editor-metrica-oscuro-grande-despues.png).
- Día: [antes](dia-oscuro-grande-antes.png) · [después](dia-oscuro-grande-despues.png).
- Secuencia: [antes](secuencia-oscuro-grande-antes.png) · [después](secuencia-oscuro-grande-despues.png).
- Diagnóstico: [antes](diagnostico-oscuro-grande-antes.png) · [después](diagnostico-oscuro-grande-despues.png).

Las demás capturas documentan el recorrido; no implican cambios particulares en cada pantalla.

## Datos usados y limpieza

- Única métrica creada: **QA prueba**, número entero, unidad «puntos», objetivo inicial 100, porción 10, ícono predeterminado. Se editó su objetivo a 200 y se comprobó en una apertura posterior.
- Se movió mediante «Mover arriba» hasta el primer lugar. Inicio reflejó ese orden y la carga rápida creó **10 puntos**. No se cargó ni editó Agua/Pasos.
- Se intentó Deshacer desde el aviso, pero no se pudo confirmar el resultado antes de que desapareciera: no se declara aprobado. El registro de prueba de 10 puntos se conserva dentro de la métrica archivada.
- **QA prueba quedó archivada**, verificada entre las cuatro archivadas. Activas nuevamente en orden Agua → Pasos. No se eliminó ninguna métrica.
- Ninguna escritura real en plan, etapas, energía, datos físicos, nombre o cuenta. No se crearon ni cortaron etapas. Las plantillas abiertas eran solo formularios locales; se descartaron al recargar.

## Límites de esta verificación

- Device Hub permite activar botones, cambiar campos por accesibilidad y ejecutar «Mover arriba/abajo», pero los toques por coordenadas y arrastres devuelven `noWindowsAvailable`. Quedan sin aprobar manualmente el drag real de filas/hojas, desplazamientos al fondo y gesto de volver.
- Se revisó el árbol de accesibilidad nativo; no se ejecutó una sesión hablada completa de VoiceOver.
- Cambiar el tamaño del sistema con una pantalla ya abierta deja mediciones viejas en algunas vistas del build durante la transición. Se volvió a montar/recargar antes de evaluar el layout definitivo; no se tomó ese estado transitorio como evidencia de un fallo corregido.
- En la captura final de Cambiar un día sí se ve el teclado de software y los campos completos con letra grande. La ráfaga de capturas no alcanzó a registrar los cuadros intermedios del cierre por la latencia del puente. No se afirma que la sincronización visual teclado/hoja haya sido validada cuadro a cuadro. El cierre y su límite de desmontaje sí están cubiertos por regresiones automatizadas.
- La cuenta devolvió Etapas sin actual, futuras ni pasadas. Edición/borrado de etapas existentes se verifican con fixtures, no creando datos de producción.
- Estados de conflicto, resultado incierto, datos físicos faltantes y fallo de red se cubren con tests. No se provocaron errores ni escrituras ambiguas sobre la cuenta real.
- Se activó Reducir movimiento en el simulador y se recargó; no se cambió su implementación ni se certifican tiempos de animación mediante estas capturas.

## Propuestas no implementadas

- Repetir en iPhone los gestos y el teclado de software antes de cerrar QA visual. No reemplazar estos gestos por una interacción nueva solo para facilitar automatización.
- Considerar un aviso de Deshacer que dure hasta interacción explícita, si el usuario lo prefiere: no se cambió su duración ni comportamiento en esta tanda.
- Contrastar por separado la respuesta real de Etapas con la configuración heredada: [Ajustes muestra Plan · 1.900 kcal](ajustes-claro-normal-despues.png), mientras [Etapas se presentó sin actual](etapas-claro-normal-despues.png). Se documenta la discrepancia sin fabricar una etapa desde otra respuesta ni cambiar semántica/servidor en este QA.

## Validación

`npm run validate`: aprobado (typecheck, lint, 166 suites / 1.279 tests y config:check). `npx expo export --platform ios --output-dir /tmp/qa/ios-complete`: aprobado, bundle Hermes generado. Ambos desde `apps/mobile`, sobre el código final. La instalación local requería restaurar `node_modules` con `npm ci`: no se modificaron manifiestos ni lockfiles.

Estado final del simulador comprobado: apariencia `light`, letra `large` (normal), `ReduceMotionEnabled = 0`; app recargada para aplicar las preferencias. No se cambió el tema ni la vibración guardados en la app.
