# #367 — Evidencia de comparación por ejercicio

Desde un ejercicio de Insights se puede ver qué registros sostienen su resultado y contra qué sesión se comparó. Agrega una vista de lectura al contrato existente y una pantalla nueva. **Sin migración, sin cambio de método, sin asociaciones nuevas y con «consistente» deshabilitado.**

## Qué existía y qué faltaba

**Ya existía**
- **Comparador compartido** (`compareSessions`) con salida completa: referencia con su exposición, señales directas con las series que usan (`currentSetIds`, `referenceSetIds`), récords del historial compatible y exclusiones. Insights pide la salida compacta (#408) y se queda con la clasificación.
- **Vista de una sesión y detalle de un día** (#410): cada ejercicio dice su resultado, el motivo y la fecha de la referencia.
- **Historial del ejercicio** (`history/exercise/[id]`): todas sus sesiones, sin la comparación de Insights. Era lo que se abría al tocar un ejercicio.

**Faltaba**
- ver la sesión de referencia y las series de los dos lados;
- ver qué señales sostienen el resultado, cuáles se cruzan y qué series quedaron afuera;
- separar el récord del resultado;
- todo eso sin leer la historia completa por ejercicio.

## Qué cambió

- **Contrato** (`performance-insights/1`, compatible):
  - vista nueva `view=evidence`, con `session`, `exercise` y `lane` (`strict` o `partial`);
  - el resto de las vistas no cambia y sus respuestas son las mismas;
  - el parser exige que cada señal apunte a series de su propio lado, que cada carril use sus palabras (`status` o `reading`) y que la unidad sea una de las cuatro. Si la sesión no tiene ese ejercicio en ese carril, `item` es `null`: ausente, no vacío.
- **Lectura acotada** (`readExerciseSource`):
  - solo las filas de ese ejercicio en sesiones terminadas, con su sesión, su configuración y sus series, filtradas por el usuario del token;
  - cada fila cuenta sus series. Si PostgREST cortó una lista, se vuelven a leer en un stream solo las series de esas filas. Nunca una lista parcial;
  - el mismo contador de Insights antes y después, con un reintento; si sigue moviéndose, la lectura no está disponible;
  - no usa el snapshot ni su caché.
- **Motor** (`insightsExerciseEvidence`):
  - corre el comparador compartido con salida completa sobre ese historial, con el mismo método y la misma regla de contexto que Insights;
  - no clasifica por su cuenta y no agrega volumen, porcentajes ni e1RM.
- **Mobile:**
  - las filas de ejercicio de un día y de una sesión abren «Evidencia» (`insights/evidence`). La ruta lleva la sesión, el ejercicio, el carril, la referencia, el resultado y la revisión de la lectura de Insights, y el origen para volver. Todo se valida antes de leer;
  - la pantalla lee una vez al abrir. Muestra:
    - el resultado con su flecha y la fecha de la referencia;
    - las señales («Con 80 kg: 8 → 10 reps», «A 8 reps: 80 → 85 kg»);
    - todas las series registradas de las dos sesiones, en su unidad, con su número de serie y su bloque. Marca cuáles usó la comparación y cuáles no se cuentan, como las sin completar;
    - los récords aparte;
    - el contexto registrado;
    - enlaces a las dos sesiones y al historial del ejercicio;
  - **señales cruzadas o sin ancla:** dice por qué no es mejora. Más carga con menos repeticiones no alcanza;
  - **carril parcial:** rotula su límite, y lo más alto se muestra como «lo más alto con contexto parcial», no como récord;
  - **si los datos cambiaron desde Insights:** con la misma referencia y el mismo resultado lo avisa y muestra los datos de ahora. Si cambió alguno, no pone otra comparación en su lugar y ofrece volver a Insights;
  - **lo que no cambia:** la vista por ejercicios sigue abriendo el historial del ejercicio. El finish no lee nada.

## Revisión de #411

- **Números de serie:** la pantalla numeraba las series por su posición en la lista, que viene ordenada por UUID. Ahora cada serie lleva su `set_number` y su bloque (`exercise_order` en la sesión).
  - Se muestran ordenadas por bloque y por número, en una copia: la lista y el comparador no cambian.
  - Con más de un bloque del mismo ejercicio dice «Bloque 1 · Serie 2». Sin número conocido dice «Serie sin número», y sin orden de bloque, «Bloque sin orden». Nunca inventa una secuencia.
- **Series sin completar:** el comparador conserva solo las series completas de una exposición. La evidencia ahora lista todas las series de sus bloques, leídas de las mismas filas que recibe el comparador. Una serie sin completar aparece como «Sin completar, no se cuenta»; antes no aparecía.
- **Contrato:** cada serie trae `blockId`, `blockOrder` y `setNumber` (entero o `null`). La vista es nueva en esta rama, así que no hay respuestas anteriores que conservar.
- **Lectura:** suma `exercise_order` y `set_number` a la misma consulta, sin pedidos nuevos. Insights no los lee.
- **Prueba contra PostgREST local descartable** (PostgreSQL 17.6.1.105, `max_rows = 1000`, 93 migraciones; la pila se borró al terminar):
  - 230 sesiones de una persona: cinco bloques del ejercicio por sesión, otro ejercicio entre ellos, tres series por bloque, series sin completar y variantes en algunos bloques. La última sesión queda en curso. Otra cuenta entrena su propio ejercicio;
  - **forma real**, con el mismo select:
    - `sets` es una lista con las seis columnas;
    - `set_count` es `[{ count: 3 }]`;
    - `session` y `session.day` son objetos;
    - `configuration` es un objeto o `null`, nunca una lista;
    - `exercise_order` es un número;
  - **1145 filas en dos páginas:** contador, dos páginas y contador. No hizo falta el stream de series porque ninguna lista vino cortada;
  - **valores iguales a SQL:** ids, sesiones y orden de cada fila, su configuración, y cada una de las 3435 series con número, reps, carga y estado, en orden por id. Las 229 sesiones terminadas tienen su fecha y la sesión en curso queda afuera;
  - **misma evidencia que con el historial completo** de Insights, en los dos carriles, en una muestra de sesiones;
  - **aislamiento:** otra cuenta no lee nada del ejercicio, ni siquiera nombrando el id de la dueña con su propio token. La dueña no lee nada del ejercicio ajeno.
  - **Sin probar ahí:** la relectura de una lista cortada. Con `max_rows = 1000` y el límite de 50 series por bloque no puede ocurrir; queda cubierta por la prueba de la ruta.

## Costo de lectura y límites

- **Pedidos:**
  - 3 por apertura: contador, una página de filas del ejercicio con sus series embebidas, contador;
  - +1 si alguna lista vino cortada (solo esas filas);
  - el doble si el contador se movió una vez.
  - Ninguno por fila de la pantalla de Insights.
- **Filas:** una por vez que se hizo el ejercicio. Una página trae hasta 1000: unos 4 años de un ejercicio hecho 4 veces por semana. Después, una página más cada 1000.
- **Cálculo** (historia sintética con configuración conocida, 6 ejercicios por sesión y un catálogo de 30):

  | Historia | Sesiones | Filas del ejercicio | Snapshot completo | Evidencia |
  |---|---|---|---|---|
  | 1 año | 204 | 42 | 81 ms | 1,2 ms |
  | 3 años | 624 | 126 | 132 ms | 2,7 ms |

  La respuesta pesa unos 2 KB. No es una medición en producción.
- **Límites:**
  - la revisión cubre todas las fuentes de Insights: anotar una comida después de abrir Insights también cuenta como cambio. En ese caso se avisa que los datos son los de ahora; no se rechaza la evidencia;
  - la configuración se muestra con la identidad guardada, que va en minúsculas;
  - las exclusiones de sesiones candidatas no se listan: solo las series excluidas de los dos lados.
  - la prueba local mide la forma y los valores, no la latencia en producción.

## Validación

- **Equivalencia:** para cada ejercicio de cada sesión publicada en los dos carriles, la evidencia da el mismo resultado, motivo, referencia, fecha y antigüedad que Insights. Da exactamente lo mismo con el historial completo que con solo las sesiones del ejercicio. Se probó con y sin configuración conocida.
- **Pruebas nuevas:**
  - **motor:** series con UUID en orden contrario a su número, en dos bloques del mismo ejercicio y una sin completar (#411); referencia compatible distinta de la última sesión, más carga con menos repeticiones, señales cruzadas con sus series, los cuatro modos en su unidad, modos distintos sin comparar, récord separado, carriles con sus palabras, ausencia;
  - **contrato:** rechaza señales con series ajenas, palabras del otro carril, unidad desconocida y una sesión distinta;
  - **local:** `performance-insights-evidence.local.test.ts`, contra PostgREST descartable (ver arriba);
  - **ruta:** `exercise_order` y `set_number` en el select y en la respuesta; solo el historial del ejercicio, por token y bajo el contador; relectura de listas cortadas solo para esas filas; un reintento y después no disponible; ausencia; parámetros completos, bien formados y solos;
  - **Mobile:**
    - etiquetas por bloque y número aunque los UUID vayan al revés, y neutrales sin número (#411);
    - una lectura al abrir, con la selección justa;
    - señales y series en su unidad;
    - mezclado por cruce y por falta de ancla, con récord aparte;
    - carril parcial;
    - comparación cambiada o más nueva;
    - parámetros inválidos sin lectura, y volver al origen;
    - lectura fallida;
    - ida y vuelta de la navegación.
- **Prueba ajustada:** la de Insights que abría el historial del ejercicio ahora espera la evidencia y comprueba que no se lee nada al tocar.
- **Pruebas que pasan:**
  - Web, motor, comparador y contrato: 393, más la prueba local;
  - Mobile Insights: 52.
- **Tipos y lint:** sin errores en Web y Mobile.

## Pendientes

- **Mobile:** requiere build. La QA física está diferida, en la [lista única](367-qa-fisica.md).
- **Sin build, despliegue ni QA física en esta rama.**

Previews bloqueadas para `codex/367-exercise-evidence` en `vercel.json`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
