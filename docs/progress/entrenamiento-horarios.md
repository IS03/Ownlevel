# Entrenamiento · Tus horarios

Implementación autorizada el 20/11/2026. Base: `main` en `3a0fe918` (#596).
Identidad: [OWNLEVEL](../brand/ownlevel-marca/IDENTIDAD.md).

## Recorrido

Progreso → Entrenamiento → Tus horarios. La portada muestra una distribución de
inicios de 00 a 24 h calculada desde la lectura que ya realizaba Entrenamiento.
No agrega consultas de fuentes a esa pantalla.

El detalle conserva el período compartido de Progreso, permite elegir una rutina
o las sesiones libres, y ofrece cinco lecturas:

| Lectura | Valor | Cobertura |
| --- | --- | --- |
| Sesiones | Cantidad de sesiones terminadas según su inicio guardado | Sesiones con inicio utilizable |
| Duración | Mediana de minutos entre inicio y final, con descansos | Sesiones con intervalo positivo y final no futuro |
| Energía al llegar | Mediana y distribución de las cinco respuestas | Respuestas previas elegibles según la comprobación temporal canónica |
| Mejoras de ejercicios | Mejoraron / comparaciones válidas | Mejoró + estable + bajó; mixtos e insuficientes se muestran aparte |
| Cargas por ejercicio | Mediana de la mayor carga registrada en cada sesión | Una identidad de ejercicio, implemento, variante conocida y modo; kg y lingotes separados |

Las columnas son intervalos semiabiertos de dos horas. Las cuatro franjas son
00–06, 06–12, 12–18 y 18–24. Son decisiones de presentación, no límites biológicos.
No se ordenan horarios por un supuesto beneficio ni se publican significancias.

Seleccionar una columna conserva el gráfico y cambia la página de sesiones.
Una página contiene hasta 30 registros, con navegación anterior/siguiente; los
agregados siempre usan todas las sesiones elegibles del período y filtro.
Abrir un registro usa la pantalla histórica existente dentro del stack de
Progreso. Volver conserva selección, período y posición de la pantalla montada.
Cambiar el período limpia los filtros que podrían haber dejado de existir.

## Reglas de interpretación

- Fuente temporal: `started_at` guardado; zona explícita Córdoba, independiente
  de la zona del dispositivo. Conserva minutos; una sesión que cruza medianoche
  se agrupa por el inicio.
- **Limitación histórica explícita:** no hay un marcador que certifique el origen
  de cada inicio antiguo. Una migración completó valores faltantes con
  `created_at`. La vista dice «inicio guardado», advierte que algunos horarios
  antiguos pueden ser aproximados y no los presenta como certificados.
- No se inventa esa procedencia comparando `created_at` y `started_at` ni se usa
  la fecha del archivo de una migración como prueba de cuándo se aplicó.
- Inicios ausentes, inválidos, futuros o cuya fecha local difiere del día lógico
  quedan fuera del análisis horario. Cada exclusión tiene su contador.
- Duración, energía y rendimiento tienen denominadores independientes. No poder
  comparar ejercicios no elimina una duración o respuesta previa utilizable.
- Energía utiliza `parseSessionFeelings` + `priorFeelingFact`: antes del inicio o
  de la primera serie según las reglas existentes. Tardía, incierta, ilegible o
  de otro instrumento no se convierte en energía previa. La energía legacy o
  posterior no reemplaza una respuesta previa.
- Mejoras utiliza `buildPerformanceInsightsV1` estricto y el comparador parcial para los ejercicios sin variante histórica (ver
  [Entre sesiones](entrenamiento-entre-sesiones.md)), con su referencia
  anterior compatible y todo el historial disponible. La referencia puede estar
  fuera del período seleccionado o corresponder a otra rutina. No usa el cálculo
  alternativo `own` ni su fórmula de fuerza estimada.
- Los denominadores de mejoras cuentan exposiciones de ejercicios; no son
  sesiones ni observaciones independientes para una prueba estadística.
- Cargas exige una ejecución conocida y compatible. No suma kilos entre
  ejercicios, no calcula e1RM y no admite modos desconocidos/asistidos como kg.
  Conserva carga cero y muestra las repeticiones de la serie seleccionada en el
  listado. Los modos sin carga externa no se fuerzan a esta vista de cargas.
- Cambios de rutina, fechas y orden de ejercicios pueden explicar diferencias.
  Filtrar una rutina reduce diferencias de contexto, pero no demuestra una causa.

## Arquitectura y compatibilidad

- Recurso opt-in: `GET /api/mobile/v1/progress/training/times`, contrato
  `training-times/1`. Reutiliza la autenticación y envoltorio de lectura de
  Progreso; no acepta identidad del cliente.
- Reutiliza `loadCompletedTrainingData` paginado y sus snapshots de ejecución.
  Añade una lectura paginada de sensaciones del período, filtrada por propietario
  y sesiones terminadas. No lee comidas, métricas, ni una sesión por petición.
- Comprueba la revisión de fuentes antes/después de una lectura nueva. Si cambió,
  descarta esa lectura y reintenta una vez; si vuelve a cambiar responde no
  disponible. También recupera el cambio de día de Córdoba.
- Cache de servidor acotada a tres entradas y cinco minutos. Clave por cuenta y
  período; solo se reutiliza tras comprobar, bajo la identidad del token, la
  revisión actual y el día. Una inspección con cache vigente requiere una lectura
  de revisión, no otra lectura histórica. Una cache fría sigue siendo correcta.
- Cache Mobile confirmada, separada por cliente/cuenta, período y filtros; las
  escrituras de entrenamiento invalidan la familia existente `training`.
- La portada pide `times=1` sobre el recurso de Entrenamiento existente. Sin ese
  parámetro la respuesta instalada conserva sus claves. Un servidor anterior que
  rechace el parámetro permite volver a la lectura previa; no se reintenta ante
  errores de red o autenticación.
- **No hay migraciones ni cambios en escrituras, CAS, idempotencia o RLS.** La
  limitación de procedencia histórica se declara, no se reescribe el historial.
- Despliegue: servidor primero; la UI requiere una actualización Mobile. Un
  merge o un despliegue Web no actualiza por sí solo un binario instalado.

## Archivos de entrada para revisión

- Cálculo: `src/lib/progress/training-times.ts` y `training-start-time.ts`.
- Contrato/lectura: `src/lib/mobile-api/progress-training-times-*`.
- Pantalla/gráfico: `apps/mobile/src/progress/training-times-*`.
- Acceso y preview: `training-story.tsx`, `progress.ts`, `progress-server.ts`.
- Histórico reutilizado: ruta `progress/training-session/[id]`.

## Evidencia y QA

Validación automática final:

- TypeScript de servidor y Mobile: aprobado.
- ESLint dirigido de servidor y lint completo Mobile: aprobados.
- Servidor/cálculo/compatibilidad de Entrenamiento: 3 suites, 57 pruebas aprobadas.
- Mobile completo: 279 suites, 2.900 pruebas aprobadas (195,743 s).
- Configuración Expo y exportación del bundle iOS: aprobadas.
- La primera corrida completa detectó un import de servidor en un fixture de
  pruebas Mobile, corregido usando respuestas ficticias de contrato. También
  falló una prueba de Deshacer de Nutrición sin cambios en esos archivos: pasó
  aislada (59 pruebas) y en la corrida completa final. No se modificó Nutrición.

Pruebas dirigidas cubren Córdoba/medianoche, minutos, intervalos ausentes,
respuestas previas tardías/ausentes, variantes incompatibles, kg/lingotes,
asistencia no admitida, carga cero, rutinas, referencias anteriores al período,
sesiones descartadas/en curso, paginación, contratos corruptos, cancelación,
lecturas de otro filtro/período, aislamiento por cuenta y cambios concurrentes.
La UI prueba conservación del gráfico durante la lectura de otra columna y
navegación al registro histórico en el mismo stack.

QA visual nativa pendiente: Computer Use informó Mac bloqueada. No se acredita
QA física, instalación ni build nativa. Revisar en iPhone: claro/oscuro, texto
grande, VoiceOver, Reducir movimiento/transparencia, selector de ejercicio,
scroll horizontal del gráfico y regreso desde el registro original.

## Investigación que orienta el alcance

- [Dighriri et al., 2026](https://pubmed.ncbi.nlm.nih.gov/41231202/): ensayo de seis
  semanas, 36 participantes, sin diferencias significativas entre horarios en
  las adaptaciones evaluadas. No establece un horario universal.
- [Küüsmaa et al., 2016](https://ro.ecu.edu.au/ecuworkspost2013/2333/): entrenamiento
  combinado durante 24 semanas; fuerza similar y diferencias de hipertrofia en
  la segunda mitad. Contexto específico, no una regla personalizada.
- [Vitale et al., 2017](https://pubmed.ncbi.nlm.nih.gov/28769855/): cronotipo,
  fatiga/vigor y esfuerzo percibido en intervalos intensos; no valida una
  recomendación causal sobre rutinas de pesas de esta app.

La feature describe registros. No estima cronotipo ni prescribe horarios.
