# Entrenamiento · Entre sesiones

Encargo del 20/11/2026: relacionar el tiempo entre entrenamientos con energía,
fatiga previas y rendimiento, tanto general como entre repeticiones de una rutina.
Base: `bc71de77` (#597, Tus horarios). Esta capacidad amplía sus lectores y
componentes sin cambiar su contrato publicado ni el análisis `own` existente.

## Preguntas que responde

- ¿Cómo llegué y qué pasó con mis ejercicios después de distintos intervalos?
- ¿Cambia la lectura si miro cualquier entrenamiento o la misma rutina?
- ¿Entrené otras cosas entre esas dos repeticiones de la rutina?

No responde «cuántas horas necesitás para recuperarte» ni diagnostica pérdida de
rendimiento por dejar de entrenar. Describe registros, no causas.

## Experiencia

Progreso → Entrenamiento → Tus horarios → **Entre sesiones**.

- Período compartido con Progreso, con encabezado flotante existente.
- Selector **General / Misma rutina**, más filtro de la rutina actual.
- Lecturas **Energía / Fatiga / Mejoras**: cambiar de lectura no hace otra consulta.
- Cinco franjas: menos de 24 h, 24–48 h, 48–72 h, 3–7 días y 7 días o más.
  Intervalos semiabiertos, sin redondear antes de agrupar. Son una organización de
  producto, no umbrales biológicos validados.
- Seleccionar una franja conserva el gráfico mientras carga la página de sesiones.
  El resumen muestra conjuntamente energía, fatiga y comparaciones de ejercicios,
  con sus denominadores independientes y distribuciones de respuestas.
- Cada fila abre la sesión actual o el antecedente en el mismo stack de Progreso.
  El regreso conserva filtros y selección. Paginación de 30 registros.
- Los inicios sin intervalo calculable siguen visibles en la lista general si su
  hora actual es utilizable; una franja contiene solo pares calculables.

Identidad: [OWNLEVEL](../brand/ownlevel-marca/IDENTIDAD.md). Se reutiliza el gráfico
de columnas de Tus horarios y el selector nativo; champagne, sin colores de juicio,
Glass solo en controles, haptics de selección, Reduce Motion y texto escalable.

## Definición temporal

`horas = (inicio guardado actual − final guardado anterior) / 3.600.000`.

Se usa el tiempo real entre instantes, no diferencia de fechas ni entre inicios.
Por ejemplo, empezar a la misma hora al día siguiente tras una sesión de una hora
produce 23 h de intervalo. Córdoba fija la correspondencia con el día lógico,
independientemente de la zona del dispositivo. Se conservan los límites de
procedencia histórica de [Tus horarios](entrenamiento-horarios.md).

- **General:** antecedente de cualquier rutina entre sesiones terminadas.
- **Misma rutina:** mismo UUID histórico, nunca coincidencia por nombre. Una
  sesión libre no se agrupa como si fuera una rutina repetible.
- Los antecedentes se buscan en el historial completo **antes de filtrar** por
  rutina o período. Filtrar PUSH no hace desaparecer un PULL intermedio del modo
  General. El antecedente puede estar antes de la ventana elegida.
- Sin antecedente registrado: desconocido; nunca cero ni un intervalo infinito.
- Si el antecedente reciente tiene horas incompletas o no corresponde con su día
  lógico, no se lo salta para fabricar un intervalo mayor con otro más antiguo.
- Orden desconocido, inicios empatados y superposiciones impiden publicar un
  intervalo como calculable. Un cero real entre final e inicio contiguos se conserva.
- En Misma rutina se cuentan otros entrenamientos registrados intermedios; si no
  pueden ubicarse con certeza, el contador es desconocido. El intervalo no se
  describe como descanso completo ni como ausencia de actividad fuera de la app.

## Lecturas y límites

- Energía y fatiga usan `priorFeelingFact` con la comprobación temporal existente:
  respuestas previas elegibles, cada instrumento con su propia cobertura. No se
  reemplazan por respuestas posteriores, tardías o legacy.
- Se muestran mediana y distribución de los cinco niveles. No se inventan ceros
  ni se igualan los denominadores de energía y fatiga.
- Rendimiento reutiliza `buildPerformanceInsightsV1` estricto y, para los ejercicios sin variante histórica, el comparador parcial
  (`buildPerformanceInsightsPartialV1`), igual que Comparaciones. El parcial solo completa un ejercicio que el estricto dejó
  insuficiente: cada exposición cuenta una vez. Corrección del 20/11: con datos reales, solo 3 de 125 bloques del mes tenían
  variante, y el estricto solo dejaba Mejoras vacía. El denominador es
  mejoró + estable + bajó; mixtos e insuficientes se muestran aparte. Sin comparación
  suficiente no se escribe «cero mejoras» como si se hubiera evaluado el resultado.
- Se cuentan comparaciones de ejercicios en sesiones, no ejercicios únicos ni
  observaciones independientes para una prueba estadística.
- La referencia de rendimiento sigue siendo la anterior compatible de cada
  ejercicio, incluso si es de otra rutina. No se cambia silenciosamente el
  comparador al cambiar el modo de intervalo.
- Rutina, carga anterior, orden de ejercicios, alimentación, sueño y fecha pueden
  coincidir con las diferencias. No hay ranking de descanso óptimo, causalidad,
  diagnóstico de fatiga, ni significancia estadística personalizada.

## Arquitectura

Recurso opt-in `GET /api/mobile/v1/progress/training/recovery`, contrato
`training-recovery/1`. Identidad del token, validación de filtros/contrato,
`no-store`, lecturas consistentes y cache acotada por cuenta/período/revisión.

Comparte `readConsistentTrainingTimesSource` con Tus horarios: no agrega tablas,
lectores por sesión, migraciones ni escrituras. Con la misma revisión y período,
abrir otra vista solo comprueba la revisión antes de reutilizar las fuentes.
Una corrección, descarte o cambio concurrente invalida la lectura como en #597.

`prepareTrainingTimes` conserva hechos internos de energía/fatiga/rendimiento.
La proyección pública `training-times/1` sigue publicando exactamente sus claves
originales por fila; fatiga se publica únicamente en el contrato nuevo.

Entradas de revisión:

- `src/lib/progress/training-recovery.ts`: selección de antecedentes y agregación.
- `src/lib/mobile-api/progress-training-recovery-*`: contrato y recurso.
- `apps/mobile/src/progress/training-recovery-*`: pantalla, estados y pruebas.
- `training-times.ts`, `progress-training-times-server.ts` y el gráfico compartido:
  reutilización y compatibilidad de la capacidad anterior.

## Investigación

- [Yang et al., 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC6015912/): 30 hombres
  recreativamente activos, 12 semanas con sesiones consecutivas (~24 h) o no
  consecutivas (~48–72 h). Mejoras similares de fuerza y composición corporal.
  Ese protocolo no define el intervalo óptimo de una persona ni de toda rutina.
- [Morán-Navarro et al., 2017](https://pubmed.ncbi.nlm.nih.gov/28965198/): el trabajo
  al fallo y sin fallo tuvo cursos de recuperación diferentes. El intervalo solo
  no representa toda la carga o recuperación de la sesión.
- [Refalo et al., 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC9908800/): 24 personas
  entrenadas, seis series de press banca y distinta proximidad al fallo; resultados
  específicos de ese protocolo sobre fatiga y recuperación a 24/48 h. No validan
  una recomendación universal de 48 h para la app.

## QA

Validación automática final: 4 suites y 78 pruebas de servidor/cálculo/compatibilidad;
281 suites y 2.905 pruebas Mobile; TypeScript y lint de servidor y Mobile;
configuración Expo y exportación del bundle iOS, todos aprobados.

Pruebas de límites de 24/48/72/168 h, medianoche y cero real; antecedente fuera de
ventana; filtro de rutina que conserva la cronología general; entrenamientos
intermedios; cambio de nombre/UUID; sesiones libres, descartadas y en curso;
antecedentes incompletos, orden desconocido y superposiciones; energía/fatiga con
cobertura independiente; comparador estricto y compatibilidad de Tus horarios;
paginación, selección, autenticación, errores de fuentes y cache compartida.

QA visual nativa e instalación no se presuponen realizadas. Revisar en iPhone los
dos modos, el retorno a ambos registros, texto grande, VoiceOver, claro/oscuro y
Reduce Motion. Un despliegue Web no actualiza el binario Mobile instalado.
