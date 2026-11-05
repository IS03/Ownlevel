# Insights · propuesta de experiencia para PR 5

Propuesta concreta y reversible para conectar el motor de [#367](https://github.com/IS03/Ownlevel/issues/367) a la app. El contrato está en [PR 4](../../docs/progress/367-insights-pr4-motor.md); las reglas visuales, en [IDENTIDAD.md](../../docs/brand/ownlevel-marca/IDENTIDAD.md). Pantallas de referencia: [flujo.html](flujo.html). No implementa nada todavía.

**Bloqueo de contenido.** Con los datos actuales el motor no compara nada, porque la configuración histórica es desconocida. Las pantallas de `flujo.html` muestran cómo se vería **después** de la [captura o metodología que se decida](../../docs/progress/367-insights-expand-propuesta.md). PR 5 no debería empezar antes de esa decisión.

## Dónde vive

**Decisión propuesta: Entrenar → Insights, con una entrada en el resumen post-entreno.**

| Opción | Por qué sí o por qué no |
| --- | --- |
| **Entrenar → Insights** (elegida) | El resultado que se explica es el rendimiento. El stack de Entrenar ya tiene sesión, ejercicio, día y calendario, los destinos naturales de la evidencia, y volver atrás conserva el lugar. |
| Progreso → otra fila | Progreso ya tiene «Qué influye», «Conexiones» y la fila «Notamos algo». Una cuarta superficie parecida confunde. |
| Solo post-entreno | No permite mirar con calma. Se usa como puerta de entrada, no como único lugar. |

- **Entrada principal:** fila «Insights» en la sección «Biblioteca» de `training-hub-dashboard.tsx`, debajo de «Historial». Ruta `/(tabs)/train/insights`, más `/(tabs)/train/insights/[relation]` para el detalle.
- **Post-entreno:** en `PostWorkoutContent`, una fila con los hechos de esa sesión que abre Insights. Es la misma lectura de un toque: no calcula asociaciones al finalizar.
- **Convivencia:** «Qué influye» es una pregunta que arma la persona; Insights es lo que el motor evaluó solo. No se fusionan en PR 5. Cuando exista OBSERVE se decide si se unifica la metodología, sin una tercera implementación paralela.
- **Reversible:** mover la fila y la ruta a Progreso no cambia el contrato ni las pantallas.

## Jerarquía de la pantalla

El estilo es editorial (directo sobre el fondo, sin tarjetas), como Nutrición y Tus etapas.

1. **Resultado.** Qué pasó en la última sesión o día comparable: «4 de 6 ejercicios comparables». Es el único número Hero de la pantalla. Debajo, una fila por estado con flecha y nunca con color: mejoró, igual, por debajo, mezclado, sin comparar.
2. **Contexto relacionado.** Lo registrado alrededor de ese entrenamiento: cómo llegaste y cómo terminaste, métricas del día y comida anterior con hora. Si algo no se registró, se dice; no aparece un cero.
3. **Relaciones.** Solo en el detalle, nunca arriba, bajo «Para mirar con calma». Mientras el presupuesto de riesgo no esté decidido, el máximo estado es «Exploratorio». Nunca se dice «consistente», «patrón» ni una causa.
4. **Evidencia.** El gráfico de pares, los días reales y el acceso a cada sesión.
5. **Cobertura y límites.** Una línea legible («Visto en 34 de 120 días») que se expande para mostrar motivos. Los tecnicismos (rho, p, permutaciones) no van a la pantalla.

Los hechos se pueden recorrer por días y por ejercicio. Un selector arriba cambia entre las dos vistas.

## Navegación desde la evidencia

| Desde | Hacia | Ruta existente | Contexto al volver |
| --- | --- | --- | --- |
| Fila de sesión | Sesión finalizada | `/(tabs)/train/history/[id]` | Stack de Entrenar, posición intacta |
| Fila de ejercicio | Historia del ejercicio | `/(tabs)/train/history/exercise/[id]` | Igual, con `routineId` si existe |
| Día de un par | Día | `/(tabs)/train/day/[date]` | Igual |
| Métrica | Tendencias de métricas | `/(tabs)/progress/trends/metrics` | Cruza de pestaña: necesita un botón de volver explícito, como `ReturnToHistoryDay` |
| Comida | Día → «Abrir Nutrición del día» | Flujo que ya existe en `history/day-screen.tsx` | Igual que hoy |

Solo se muestra un enlace si hay ruta y evidencia. Un `sessionId` de un par siempre lleva a esa sesión exacta; nunca se reconstruye por fecha.

**Conservar estado:** vista elegida, cursor `before` y filtro de familia van en los parámetros de la ruta, para sobrevivir a la navegación y al reinicio. El scroll se conserva porque se empuja encima del stack. El detalle se pide con `association=<id>`, sin recalcular en el cliente.

## Estados

| Situación | Dato del contrato | Qué se ve |
| --- | --- | --- |
| Cargando | Lectura en curso | Esqueletos con el alto final, sin saltos de layout |
| Sin historial | `history.sessions = 0` | Pantalla con vista de ejemplo apagada y etiqueta **EJEMPLO**: «Con dos entrenamientos del mismo ejercicio empieza a compararse.» |
| Hay sesiones, nada comparable | `totals.comparable = 0` | Motivos reales: «Todavía no hay una sesión anterior para comparar.» |
| Configuración desconocida | `limits.configurationSnapshots.known = 0` o motivo `missing_context` | Se muestra lo registrado y se dice el límite: «Todavía no sabemos si estas sesiones se hicieron igual, así que no las comparamos.» No es un error ni un historial vacío |
| Comida con hora sin confirmar | `carbsPre3h.state = unverified_meal_time_in_scope` | «Hay comidas cargadas, pero no sabemos si esa fue la hora en que comiste.» Sin valor de ventana |
| Datos insuficientes | `insufficient_data` | «Todavía faltan días: tenés 12 de 20.» Sin gráfico vacío |
| Sin señal clara | `no_clear_signal` | «Por ahora no se ve una relación clara.» Es un resultado, no un error |
| Exploratorio | `exploratory` | «Para mirar con calma» y la frase del ejemplo de abajo |
| Error | HTTP 503 | «Uy, no pudimos leer tus datos. Tranqui: está todo guardado.» y reintentar |
| Datos contradictorios | `integrity = conflicting_duplicates` | Mismo trato que error. **Nunca** se muestra como historial vacío |
| Más días | `page.nextBefore` | Sigue cargando al llegar al final, con cursor |

## Textos de ejemplo

Voseo, frases cortas y sin culpa. Sin exclamaciones, salvo en récords.

- **Hecho:** «Hoy, 2 de 6 ejercicios quedaron por debajo de la última vez.» Un descenso no es pérdida: «Puede ser programación, descarga o el día.»
- **Exploratorio:** «Los días con más carbohidratos antes de entrenar, menos ejercicios quedaron por debajo. Lo vimos en 34 de 120 días. Todavía no alcanza para decir que se repite.»
- **Comida:** nombrar siempre lo registrado: «Carbohidratos registrados». Nunca «comiste» ni «ayuno».
- **Sensación:** «Energía antes de entrenar». Una respuesta tardía se excluye y el motivo se explica en la cobertura.
- **Prohibido:** causar, optimizar, «deberías», puntajes y rangos ideales.

## Vidrio, movimiento y accesibilidad

- **Vidrio solo en controles:** barra superior al hacer scroll, selector de vista, filtro de familia y el botón flotante de volver. Se usa `GlassSurface`, con su fallback opaco para Android, iOS anterior y Reducir transparencia. **Nunca** sobre filas, reportes ni gráficos: los controles que quedan sobre un gráfico son los únicos con material.
- **Movimiento:** 200 ms para seleccionar y 300 ms para expandir y navegar, con el resorte de marca y presión al 95 %. Reducir movimiento lo pasa a fundidos. Sin animaciones al leer ni al llegar datos que muevan el layout.
- **Vibración:** tic de selección solo al cambiar vista o filtro. Nada por cada lectura; éxito queda reservado a récord y fin de entreno.
- **Color:** champagne solo para la selección activa y el récord. Subas y bajas con flecha. Sin rojo ni verde sobre los datos; `error` solo para fallas de lectura.
- **Números:** cifras tabulares y formato de pantalla (0,25 no; «1 de 4» sí).
- **Dynamic Type:** con `fontScale > 1.3`, etiqueta y valor se apilan y se permite el salto de línea; no se trunca ni se aprieta.
- **VoiceOver:** cada fila se lee como una oración («Press banca, por debajo de la última vez, hace 3 días»). Las flechas tienen texto. Cada gráfico tiene un resumen y una alternativa en lista.
- **Toque:** mínimo 44 en filas, chips y puntos del gráfico.
- **Íconos:** SF Symbols en iOS y Lucide en el resto, con las medidas de la identidad.

## Gráficos

Una serie: champagne, con el período anterior en gris.

- **Tira por día:** proporción de ejercicios por debajo. **Cero es una marca visible en la base; un día sin comparación es un hueco**, no una barra de cero. No se interpola.
- **Pares de una relación:** cada punto es un día. Los valores de cero y los negativos se conservan en su lugar: el eje no se recorta para que se vean mejor. Sin línea de tendencia ni rangos «óptimos».
- **Unidades:** solo la unidad guardada de esa métrica. Si no tiene, no se inventa.
- **Grupos:** comparación descriptiva, con los valores reales de `min` y `max` de cada lado: «con 1» y «con 0», o «hasta 1800» y «más de 1800». Si `groups` es nulo, se muestran los pares sin grupos. Los días con el mismo valor nunca se separan.

## Guías futuras

Tres carriles separados que no se mezclan en una misma frase:

1. **Cómo leemos esto:** explicación fija del método, igual para todos.
2. **Tus registros:** asociaciones personales del motor, con su evidencia.
3. **Guías generales:** contenido futuro de entrenamiento o nutrición, con otra autoría y otra etiqueta.

No se agrega todavía un GPT generador ni cambios automáticos de rutina. Una relación nunca edita una rutina ni sugiere una carga.

## Pendiente de decidir

- **Configuración histórica:** captura hacia adelante, metodología parcial o ambas. Sin esto no hay comparaciones ni asociaciones. Ver la [propuesta](../../docs/progress/367-insights-expand-propuesta.md).
- **Procedencia de la hora de comida:** EXPAND propuesto en el mismo documento. Sin él, las ventanas previas al entreno solo cuentan con comidas importadas con hora.
- **Presupuesto de riesgo del 1 %:** sin aprobar. Hasta decidirlo, el estado «consistente» no existe en el contrato.
- **Web:** Mobile primero. El contrato ya está listo para que Web lo consuma con la misma semántica; su diseño se resuelve con M9.4.
- **Nombre:** «Insights» es provisorio. Hay que validar si convive con el voseo del resto de la app.
