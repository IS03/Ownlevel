# Insights · experiencia de PR 5

Decisiones para conectar el motor de [#367](https://github.com/IS03/Ownlevel/issues/367) a la app. El contrato está en [PR 4](../../docs/progress/367-insights-pr4-motor.md); las reglas visuales, en [IDENTIDAD.md](../../docs/brand/ownlevel-marca/IDENTIDAD.md). Pantallas de referencia: [flujo.html](flujo.html). Implementado en `apps/mobile/src/insights`; ver [Estado de la implementación](#estado-de-la-implementación).

**Dos métodos, siempre separados.** Con los datos actuales el método estricto no compara nada, porque la configuración histórica es desconocida. La pantalla usa el [método parcial](../../docs/progress/367-insights-partial-metodo.md), con su límite a la vista: «registro superior, igual o inferior con contexto parcial». Nunca se suman ni se presentan como la misma lectura. `flujo.html` muestra el vocabulario estricto.

## Dónde vive

**Decisión propuesta: Entrenar → Insights, con una entrada en el resumen post-entreno.**

| Opción | Por qué sí o por qué no |
| --- | --- |
| **Entrenar → Insights** (elegida) | El resultado que se explica es el rendimiento. El stack de Entrenar ya tiene sesión, ejercicio, día y calendario, los destinos naturales de la evidencia, y volver atrás conserva el lugar. |
| Progreso → otra fila | Progreso ya tiene «Qué influye», «Conexiones» y la fila «Notamos algo». Una cuarta superficie parecida confunde. |
| Solo post-entreno | No permite mirar con calma. Se usa como puerta de entrada, no como único lugar. |

- **Entrada principal:** fila «Insights» en la sección «Biblioteca» de `training-hub-dashboard.tsx`, debajo de «Historial». Ruta `/(tabs)/train/insights`, más `/(tabs)/train/insights/[relation]` para el detalle.
- **Post-entreno:** en `PostWorkoutContent`, el botón «Comparar en Insights» abre los hechos de esa sesión. Terminar no pide nada: la lectura sale al abrir Insights, sin relaciones.
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
| Métrica | Tendencias de métricas, con esa métrica y el mes de ese día | `/(tabs)/progress/trends/metrics` | Cruza de pestaña: «Volver a Insights» restaura vista, filtro, relaciones abiertas y día, o la relación de origen |
| Comida | Día → «Abrir Nutrición del día» | Flujo que ya existe en `history/day-screen.tsx` | Igual que hoy |

Solo se muestra un enlace si hay ruta y evidencia. Un `sessionId` de un par siempre lleva a esa sesión exacta; nunca se reconstruye por fecha.

**Conservar estado:** vista, filtro de familia, relaciones abiertas, día seleccionado y sesión van en los parámetros de la ruta, para sobrevivir a la navegación. El scroll se conserva porque se empuja encima del stack. El detalle se pide con `association=<id>`, sin recalcular en el cliente.

## Estados

| Situación | Dato del contrato | Qué se ve |
| --- | --- | --- |
| Cargando | Lectura en curso | Esqueletos con el alto final, sin saltos de layout |
| Sin historial | `history.sessions = 0` | Pantalla con vista de ejemplo apagada y etiqueta **EJEMPLO**: «Con dos entrenamientos del mismo ejercicio empieza a compararse.» |
| Hay sesiones, nada comparable | `totals.comparable = 0` | Motivos reales: «Todavía no hay una sesión anterior para comparar.» |
| Configuración desconocida | Carril `partial` | Registros con contexto parcial, con el límite escrito: no sabemos si cambió agarre, banco o posición. No es un error ni un historial vacío |
| Falta modo o implemento | Motivo `missing_context` en el carril parcial | «Faltan el modo o el implemento en estas sesiones, así que no las comparamos.» |
| Comida con hora sin confirmar | `carbsPre3h.state = unverified_meal_time_in_scope` | «Hay comidas cargadas, pero no sabemos si esa fue la hora en que comiste.» Sin valor de ventana |
| Datos insuficientes | `insufficient_data` | «Todavía faltan días: tenés 12 de 20.» Sin gráfico vacío |
| Sin señal clara | `no_clear_signal` | «Por ahora no se ve una relación clara.» Es un resultado, no un error |
| Exploratorio | `exploratory`, método estricto | «Para mirar con calma» y la frase del ejemplo de abajo |
| Coincidencia | `coincidence_context_unknown`, método parcial | «Coincidieron». Dice que no sabemos si esos días cambió la variante, y que eso no dice que tenga que ver |
| Error | HTTP 503 | «Uy, no pudimos leer tus datos. Tranqui: está todo guardado.» y reintentar |
| Datos contradictorios | `integrity = conflicting_duplicates` | Mismo trato que error. **Nunca** se muestra como historial vacío |
| Más días | `page.nextBefore` | Botón «Ver más días». Si los datos cambiaron, no se unen páginas: se actualiza la lista y se avisa |

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

## Estado de la implementación

Hecho: fila en Biblioteca, pantalla principal por días y por ejercicio, detalle de una relación, estados, contexto, tira por día, gráfico de pares, entrada desde el post-entreno y enlace a las tendencias de una métrica.

### Entrada desde el post-entreno

- **Nada se calcula al terminar:** el botón no lee. Al abrir, sale `summary`, sin permutaciones.
- **Una sesión anterior a la primera página** pide solo su día (`view=days&before=<día siguiente>&limit=1`). Ese día se muestra aparte y nunca se une a la lista.
- **Estados:** cargando, no se pudo leer y «esta sesión todavía no aparece» son distintos, y ninguno parece un historial vacío.
- **Volver:** el botón reemplaza la sesión por Entrenar y abre Insights encima, así que atrás lleva a Entrenar.

### Enlace a una métrica

- Sale de una métrica del contexto de un día o del detalle de una relación de métrica. Solo con una métrica que la lectura nombra.
- Lleva el mes de ese día. **Cambia el período compartido de Progreso**, igual que los enlaces que ya llegan a Nutrición.
- La flecha de atrás de Progreso sigue su propia pila. El camino de regreso es «Volver a Insights», cuyos parámetros se validan uno por uno.

### Revisiones

- Refrescar la misma lectura conserva los días ya cargados. Otra lectura los descarta, y la pantalla lo dice.
- Las relaciones no se muestran junto a hechos de otra lectura: se vuelven a leer ambas hasta que coinciden.

Diferencias con lo propuesto, para revisar en la QA física:

| Propuesto | Implementado | Motivo |
| --- | --- | --- |
| Cargar más días al llegar al final | Botón «Ver más días» | Cada página es una lectura completa del servidor (96 consultas a 5 años). No conviene dispararla con un scroll |
| Puntos del gráfico tocables, de 44 pt | El gráfico no se toca; la lista de abajo lleva a cada día | Con muchos días, los puntos se superponen y no llegan a 44 pt |
| Cursor `before` en los parámetros | Vista, filtro y relaciones abiertas sí; las páginas extra, en memoria | Una página restaurada exigiría repetir sus lecturas al volver |
| Relaciones visibles al abrir | Se piden al tocar «Para mirar con calma» | Son lo que cuesta calcular, y el plan ya las quería fuera de la primera lectura |

Sin verificar: aspecto en dispositivo, Liquid Glass, Dynamic Type grande, VoiceOver real, movimiento y el cruce real de pestañas. Solo pasaron las pruebas automáticas, con el router simulado.

Sin decidir: al volver a Insights, la pila de Progreso conserva la pantalla de tendencias arriba, igual que hoy con «Volver al día». La próxima visita a Progreso la encuentra ahí.

## Dependencias con otros PR

| PR | Relación con #390 | Qué pasa sin él |
| --- | --- | --- |
| #386 | **Base** de este PR | No compila |
| #385 | Base de #386 | No compila. Es el endpoint: sin desplegarlo, la pantalla muestra el error de lectura |
| #383 | **Independiente.** Captura sensaciones | «Sin registrar» en sensaciones nuevas. Las ya guardadas se leen igual |
| #389 | **Independiente.** Lee la procedencia horaria | Las ventanas previas siguen contando solo comidas importadas. La UI no cambia: ya conoce todos los estados |

**No se integran entre sí:** #390 no contiene código de #383 ni de #389. #389 requiere la migración de #387, así que integrarlo acá volvería a #390 dependiente de ella.

**Comprobación:** una integración temporal local de los tres fusiona sin conflictos y pasa tipos y suites dirigidas. Detalle en la [descripción del PR](../../docs/progress/367-insights-pr5-pr-description.md).

## Pendiente de decidir

- **Captura futura de configuración:** regla de producto sin definir. El método parcial permite seguir mientras tanto.
- **Procedencia de la hora de comida:** [EXPAND y ADOPT en borrador](../../docs/progress/367-meal-time-provenance.md). Sin aplicarlos, las ventanas previas al entreno solo cuentan con comidas importadas con hora.
- **Presupuesto de riesgo del 1 %:** sin aprobar. Hasta decidirlo, el estado «consistente» no existe en el contrato.
- **Web:** Mobile primero. El contrato ya está listo para que Web lo consuma con la misma semántica; su diseño se resuelve con M9.4.
- **Nombre:** «Insights» es provisorio. Hay que validar si convive con el voseo del resto de la app.
