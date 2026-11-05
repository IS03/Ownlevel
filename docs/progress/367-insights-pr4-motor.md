# Insights #367 — PR 4: motor, read model y calibración

Método **`insights-engine/1`**, contrato **`performance-insights/1`**, sobre el comparador [`insights-performance/1`](367-insights-pr1-comparador.md). Dominio puro en `src/lib/progress/insights-engine`, compartido por la API y por Expo. Ruta nueva y optativa: `GET /api/mobile/v1/progress/performance-insights`. **Sin UI, migraciones, datos personales, deploys ni builds.** La experiencia está propuesta en [bocetos/insights/PLAN.md](../../bocetos/insights/PLAN.md) y se implementa en PR 5.

**Estado con datos reales: el motor no compara nada todavía.** La configuración histórica no existe y el método exige conocerla, así que todo ejercicio queda en `insufficient_comparison / missing_context`, sin días de resultado ni asociaciones. Es el comportamiento correcto del método publicado, no un fallo. El [método parcial](367-insights-partial-metodo.md), en un PR apilado, cubre ese historial con su límite declarado y sin cambiar nada de lo que describe este documento.

**Dependencias.** Sale de main y no usa código exclusivo de #383: la tabla `workout_session_feelings` ya está publicada. Sin #383 mergeado no llegan sensaciones nuevas de los clientes, así que esos candidatos quedan en «datos insuficientes». `vercel.json` bloquea las previews de esta rama; si #380, #383 y este PR se integran en cualquier orden, ese archivo puede dar un conflicto trivial de una línea.

## Tres carriles

| Carril | Contiene | Límite |
| --- | --- | --- |
| **Hechos** | Estado por ejercicio, sesión y día del comparador; referencia, antigüedad, récords separados, denominadores y exclusiones | Un descenso son registros inferiores, no pérdida de capacidad |
| **Contexto** | Sensaciones pre y post, métricas del día, nutrición registrada, carbohidratos previos y metadata legacy | Es lo registrado alrededor; no afirma relación |
| **Asociaciones** | Candidatos preespecificados contra la proporción diaria de descensos | Máximo «exploratorio»; `promotion.status = not_enabled` |

## Decisiones de datos

- **Historial completo:** siete flujos paginados, sin período ni truncamiento. La salida se separa en [vistas](367-insights-partial-metodo.md#vistas-y-reutilización): resumen, más días, relaciones y una relación. Todas salen de la misma lectura, y `before` y `limit` paginan los días (14 por defecto, máximo 120) e informan el total.
- **Unidad:** se deriva del `weight_mode_snapshot` histórico, que define qué guarda el campo. Nunca del catálogo vigente.
- **Configuración:** el producto nunca la capturó y el loader lee `null`. Sigue siendo desconocida en ambos lados: `contextIssue` da `missing_context`, sin identidades por defecto ni datos del catálogo. `limits.configurationSnapshots` informa `known` y `total`. Los fixtures usan `none` para modelar una captura futura; el loader nunca lo escribe.
- **Snapshot ausente:** si falta modo o implemento, queda `insufficient_comparison` con motivo.
- **Hora de comida:** ver [procedencia](#procedencia-de-la-hora-de-comida). Solo `explicit` entra en el valor primario.
- **Faltantes:** día sin comidas, métrica sin valor o macro `null` quedan fuera y se cuentan por motivo. Un macro `null` deja el total como parcial, nunca como cero. Un cero registrado sí es un valor.
- **Día abierto:** hoy no entra en asociaciones, porque su ingesta y sus métricas siguen abiertas. Sí aparece en hechos, con `openDay`.
- **Ingesta:** todo se nombra como registrado; `limits.ingestionCompleteKnown = false`.
- **Consistencia, de mejor esfuerzo:** se compara una revisión de las siete fuentes (cantidad de filas y último cambio) antes y después de leer, con un reintento, y si detecta un cambio responde 503. **No garantiza detectar todos:** si una transacción que empezó antes confirma después de otra más nueva, la fila cambia sin mover ni la cantidad ni el máximo. Ver la [revisión transaccional propuesta](367-insights-source-revision.md). Una sesión en curso no la altera.
- **Errores:** un flujo fallido o un número ilegible da 503, no un historial vacío. `integrity = conflicting_duplicates` llega sin filas y no significa vacío.

## Procedencia de la hora de comida

`mealTimeEvidence` ya no reutiliza el helper legacy, que da por conocida una hora sin marca. El helper y sus consumidores no cambian. `created_at` dejó de leerse: unos timestamps distintos no prueban nada, porque Web escribe la hora de su propio reloj aunque nadie haya declarado una.

| `raw_input` | Evidencia | Valor primario |
| --- | --- | --- |
| `originalTimeKnown: true`, sin `timeSource`, en una fila de una importación (`source_type = sheet_import` y `import_run_id`) | `explicit` | Sí |
| `originalTimeKnown: true` en cualquier otra fila | `unverified` | No: un token puede escribir ese texto en sus propias filas |
| `originalTimeKnown: false` y `timeSource: "registration"` | `registration` | No; solo sensibilidad |
| `originalTimeKnown: false` | `unknown` | No |
| `null`, JSON inválido, sin marca o con marcas contradictorias | `unverified` | No; solo sensibilidad |

Hoy **solo la importación histórica** escribe la marca positiva: Web, Mobile y ChatGPT dejan `raw_input` nulo con o sin hora declarada ([tabla de productores](367-insights-expand-propuesta.md#a-procedencia-de-la-hora-de-comida)). No se admite por inferencia ninguna otra forma, aunque un caso sea deducible:

- ChatGPT v2 con hora guarda `null`, igual que ChatGPT v1 sin hora.
- `{"timeSource":"registration"}` sin la otra clave aparece al editar la hora de una comida de ChatGPT. Queda como `unverified`: es un residuo, no una marca escrita para esto.

Consecuencias, conservadas en el contrato:

- Un día con una comida `unverified` en alcance queda fuera de la ventana, con `unverified_meal_time_in_scope`.
- La sensibilidad `with_unverified_time` muestra qué pasaría si se aceptaran; nunca reemplaza el valor primario.
- `limits.mealTimeEvidence` da el denominador por tipo de evidencia.

## Candidatos y ventanas

Quedan fijados antes de mirar resultados. Todos cuentan para la corrección, se muestren o no.

| Familia | Ventanas | Por qué |
| --- | --- | --- |
| Toda métrica por UUID, también archivada | Mismo día, día anterior | Sin lista por nombre, unidad ni `system_key`. El total del mismo día no tiene orden respecto del entreno; el del día anterior es previo por fecha lógica, aunque se haya cargado después |
| Calorías, proteínas, carbohidratos, grasas | Mismo día, día anterior | Totales registrados. El mismo día puede incluir comidas posteriores: se etiqueta `same_day_unordered` |
| Carbohidratos con hora explícita | 3 h antes del inicio; mismo día antes del inicio | Tres horas es una decisión de producto, no un óptimo fisiológico. 2 h, 4 h y horas aproximadas solo se reportan como sensibilidad y **nunca** reemplazan el valor primario |
| Energía y fatiga pre | Sesión | Solo si se capturaron antes de la primera serie registrada. Reloj declarado como no verificado |

Las sensaciones post quedan en contexto y no son candidatas. Las exposiciones de sesión usan solo días con una única sesión; los demás se cuentan como `multiple_sessions_day`. Una métrica diaria aporta una observación por día, sin importar cuántos ejercicios haya.

## Política de evidencia

- **Resultado:** proporción diaria de descensos sobre comparaciones evaluables, con la variante de igual peso por sesión como sensibilidad.
- **Estadístico:** Spearman para mostrar y, para decidir, Spearman sobre residuos locales (mediana móvil de ±28 días, con ventana simétrica en los bordes).
- **Inferencia:** 499 permutaciones por bloques de 14 observaciones, con semilla fija. Todos los candidatos usan las mismas permutaciones, y el máximo controla la familia completa.
- **Elegibilidad:** al menos 20 pares y 5 observaciones fuera del valor más repetido; si no, `sparse_variation`. No depende de cómo se dibujen los grupos.
- **Grupos, solo descriptivos:** se corta en la mediana. Los empates van al lado que deja los grupos más parejos; a igual balance, los valores iguales a la mediana van arriba. El lado se elige solo con la exposición, nunca con el resultado, y los valores iguales no se separan. Una variable binaria conserva sus dos valores reales. Cada grupo informa `min` y `max`. Si un lado tiene menos de 5 días, `groups` es nulo sin afectar el estado.
- **Sin extremos:** se quita el 5 % de cada punta por posición, con empates en orden de fecha. Quitar por valor vaciaba una variable binaria y le impedía pasar la compuerta estricta.
- **Exploratorio:** además, p ≤ 0,05, |rho| ≥ 0,25, |rho local| ≥ 0,15 y sin ausencia selectiva.
- **Compuerta estricta (interna):** además, al menos 40 pares, p ajustada ≤ 0,01, |rho| ≥ 0,3, |rho local| ≥ 0,2, cobertura ≥ 50 %, ambas mitades cronológicas del mismo signo con |rho| ≥ 0,15, estable con igual peso por sesión y sin extremos, y sin depender de una rutina. **No se publica:** el read model la elimina y solo la usa la calibración.

## Calibración sintética

Cada historial simula 24 meses, unas 334 observaciones al final, con 12 actualizaciones durante el último año y 199 permutaciones. Una historia cuenta si algún candidato pasa en alguna actualización. Semilla `0x367a`, reproducible con `INSIGHTS_CALIBRATION_OUT=<archivo> INSIGHTS_CALIBRATION_HISTORIES=1000 npx vitest run src/lib/progress/insights-engine/calibration.test.ts -t measured`.

Resultados con 1000 historiales por escenario:

| Escenario | Candidatos | Algún exploratorio | Compuerta estricta | Wilson sup. 95 % |
| --- | --- | --- | --- | --- |
| Independiente | 12 | 2,0 % | 0,0 % | 0,38 % |
| Dependencia temporal | 12 | 3,8 % | 0,3 % | 0,88 % |
| Tendencias espurias | 12 | 21,4 % | 0,8 % | 1,57 % |
| Cambios de rutina | 12 | 23,0 % | **1,8 %** | **2,83 %** |
| Outliers | 12 | 1,1 % | 0,0 % | 0,38 % |
| Ausencia selectiva | 12 | 0,0 % | 0,0 % | 0,38 % |
| Múltiples candidatos correlacionados | 40 | 5,6 % | 0,3 % | 0,88 % |

Sensibilidad con efecto plantado en un candidato:

| Efecto | Exploratorio | Compuerta estricta |
| --- | --- | --- |
| Moderado (0,45 en logit) | 73,2 % | 41,0 % |
| Fuerte (0,9 en logit) | 100 % | 99,9 % |

### Exposiciones con valores repetidos

Antes, una exposición cuya mediana coincidía con su mínimo quedaba bloqueada, así que estos casos nunca se habían evaluado. Se agregaron cinco escenarios, con los mismos 1000 historiales, 12 actualizaciones y 199 permutaciones:

| Escenario | Algún exploratorio | Compuerta estricta | Wilson sup. 95 % |
| --- | --- | --- | --- |
| Binaria, un tercio de los días | 1,4 % | 0,1 % | 0,56 % |
| Binaria rara, 5 % de los días | 0,5 % | 0,0 % | 0,38 % |
| Escala 1 a 5 con empates | 1,7 % | 0,2 % | 0,73 % |
| Binaria con cambios de rutina | 24,5 % | **1,4 %** | **2,34 %** |

Con un efecto plantado de 1,2 en logit sobre una binaria, el candidato pasa exploratorio en 99,1 % y la compuerta estricta en 92,4 %. Abrir estos casos no fuerza resultados: en nulos sin deriva quedan por debajo del 1 %, y el problema de los cambios de rutina es el mismo que en las exposiciones continuas.

### Evidencia que sigue vigente

| Evidencia | Estado | Por qué |
| --- | --- | --- |
| Calibración continua de la tabla anterior | **Vigente** | Elegibilidad y recorte dan lo mismo sin empates. Con 100 historiales por escenario, los 9 resultados son idénticos a los de `f839f29`. No se repitió con 1000 |
| Fixtures de asociación, ranking y permutación | Vigente | Sin cambios en la estadística |
| Calibración de exposiciones con empates | **Nueva** | Antes no existía |
| Escala y PostgREST | **Medidos otra vez** | El cálculo cambió. Ver [Escala](#escala) |

**La calibración no valida el motor con datos reales.** Sus series entran directo en la evaluación de asociaciones y no dependen de la configuración ni de la hora de comida. Mide la política estadística, que recién tendrá datos cuando se resuelva la configuración.

**Evaluación del 1 %: no aprobado y hoy no alcanzado en todos los escenarios.** Queda por debajo en independencia, dependencia temporal, outliers, ausencia selectiva, múltiples candidatos y exposiciones repetidas sin deriva. Cambios de rutina lo supera (1,8 % continua, 1,4 % binaria), y en tendencias el punto queda debajo pero su intervalo no descarta superarlo. Por eso «consistente» sigue fuera del contrato.

**Qué haría falta antes de habilitarlo:** decidir el presupuesto de riesgo y estratificar por etapa de rutina, ya que los residuos locales no absorben un cambio simultáneo en exposición y resultado. Exploratorio aparece hasta en un 23 % de los historiales nulos con deriva o cambios de rutina, así que debe quedar solo en detalle y con un texto que no afirme que se repite.

**Iteración registrada.** La primera campaña (300 historiales, p ajustada ≤ 0,05) dio 1,3 % en dependencia temporal, 2,7 % en tendencias y 3,3 % en rutina. Se endureció la p ajustada a 0,01 por las 12 actualizaciones anuales, y se exigió también efecto local para exploratorio. Esos ajustes se decidieron con historiales nulos, no con resultados de una persona ni eligiendo ventanas. Antes, una prueba detectó que la mediana unilateral de los bordes inducía correlación entre series con tendencia; se corrigió con la ventana simétrica.

**Límites:** son modelos sintéticos elegidos por nosotros, no una garantía sobre historiales reales. La alternativa de referencia con varias exposiciones anteriores no se calibró.

## Escala

Solo cálculo, con perfiles sintéticos y 499 permutaciones. Los objetivos eran propuestas de la Etapa 0, no compromisos. «Hoy» son los datos que lee el loader, sin configuración ni marca de hora. «Con captura» modela los mismos datos después de un EXPAND.

| Perfil | Series | Candidatos | Datos | Comparaciones | Cálculo (máx.) | Respuesta | Memoria adicional |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 año | 5232 | 28 | Hoy | 0 | 43 ms | 62 KiB | 21 MiB |
| | | | Con captura | 1278 | 98 ms | 72 KiB | 29 MiB |
| 5 años | 31 464 | 52 | Hoy | 0 | 123 ms | 90 KiB | 89 MiB |
| | | | Con captura | 7826 | 807 ms | 108 KiB | 109 MiB |
| 10 años intensos | 125 480 | 72 | Hoy | 0 | 427 ms | 121 KiB | **212 MiB** |
| | | | Con captura | 25 036 | **4,9 s** | **147 KiB** | **239 MiB** |
| Objetivo | | | | | ≤ 1 s | ≤ 128 KiB | ≤ 128 MiB |

El perfil de 10 años supera los objetivos. No se trunca: si esa escala se vuelve real, hay que revisar la arquitectura de forma explícita. La memoria se toma después de cada corrida, no es un pico real: **no se puede comparar con los 479 MiB informados antes**, y no pude explicar esa diferencia.

### Costo real de lectura

```text
P = suma de páginas de los 7 flujos = suma(máximo(1, techo(filas / 1000)))
un intento = 7 revisión antes + P + 7 revisión después = P + 14
```

**No son nueve lecturas**, como estimaba la Etapa 0: cada comprobación de revisión son 7 consultas, una por flujo.

| Caso | Fórmula | 1 año (P = 16) | 5 años (P = 82) | 10 años (P = 266) |
| --- | --- | --- | --- | --- |
| Fuentes estables | P + 14 | 30 | 96 | 280 |
| Una fuente cambia: un reintento | 2(P + 14) | 60 | 192 | 560 |
| Siguen cambiando: 503 | 2(P + 14) | 60 | 192 | 560 |
| Medianoche de Córdoba durante la lectura | 2(P + 14) | 60 | 192 | 560 |
| Ambos reintentos, peor caso | 4(P + 14) | 120 | 384 | 1120 |

Las cinco filas están verificadas contra la ruta real con un cliente que cuenta consultas (`performance-insights.test.ts`, con P = 7), y el caso estable también contra PostgREST. A esto se suma la autenticación del token. Las consultas crecen con las filas, no con ejercicios, sesiones ni candidatos.

No se quita ninguna garantía para bajar el número. Hay una [alternativa con una RPC](367-insights-expand-propuesta.md#d-consistencia-con-menos-consultas), que recomiendo decidir con datos de OBSERVE.

### PostgREST local real

Sobre esquema completo (89 migraciones), con usuarios sintéticos, token real y RLS, en una pila descartable que se eliminó al terminar. El test falla si la lectura no hace exactamente `14 + P` consultas reales.

A 5 años, con 8016 series (el seed crea una serie por ejercicio, menos que el perfil de arriba) y P = 60, cada lectura hizo **74 consultas**:

| Base | Lectura consistente | Ronda de revisión | Revisión de `workout_sets` | Cálculo |
| --- | --- | --- | --- | --- |
| Con estadísticas (`ANALYZE`) | 313–351 ms | 41–45 ms | 39–46 ms | 75–86 ms |
| Recién sembrada, sin estadísticas | **2,8–2,9 s** | **1,2 s** | **1,2 s** | 91–123 ms |

Las rondas corren en paralelo, así que tardan lo que su consulta más lenta. **La revisión de `workout_sets` tiene un plan frágil:** cruza series, ejercicios y sesiones, y sin estadísticas tarda unas 30 veces más. Producción corre con autovacuum, pero hay que observarla, y este seed tiene menos series que un historial real de 5 años.

Esta medición reemplaza a la anterior (568–623 ms de lectura), hecha sobre otra pila y sin registrar el estado de sus estadísticas. Son loopback y Docker en esta PC: **no representan la latencia de producción**.

Tres optimizaciones salieron de esas mediciones, sin cambiar resultados:

- El comparador suma `exclusionDetail: "summary"`, que deja de crear una fila por cada sesión posterior; se generaban 776 580 objetos a 5 años. El valor por defecto no cambia.
- `uniqueRows` ya no calcula la huella de filas sin duplicado, y el modo normalizado se memoiza.
- Ejercicios y series se leen sin `join` y se filtran en memoria contra las sesiones completadas. Bajó de 4,3 s a 0,6 s, siempre bajo RLS.

## Validación

- `engine.test.ts`: 27 fixtures de decisiones exactas. `calibration.test.ts`: 3 reproducibles para CI. `scale.test.ts`: 1. `performance-insights.test.ts`: 12 de ruta, loader y costo de consultas. Comparador: 67.
- `performance-insights.local.test.ts`: 2 contra Supabase local descartable, que se omiten sin su configuración. Verifican los `select` reales, que el token del dueño no lee filas ajenas al pedirlas y que sin identidad se rechaza. La instancia se eliminó al terminar.
- Tipos raíz y Mobile, y lint focalizado.
- Regresiones de la revisión de #385: procedencia horaria, configuración desconocida y variables binarias con empates.
- **Sin ejecutar:** el endpoint en producción, ni contra datos reales.

## Pendientes

- **Decisión de configuración:** captura, metodología parcial o ambas. Bloquea hechos y asociaciones con datos reales.
- EXPAND de procedencia de la hora de comida.
- Decisión del presupuesto de riesgo y estratificación por rutina.
- PR 5: pantallas, entrada post-entreno y su QA física, que queda diferida hasta que se avise.
- Revisar con datos reales qué tan seguido falta `implement_snapshot`, sin consultar datos personales fuera de una decisión explícita.
- Unificación futura con «Qué influye», solo después de OBSERVE.
- Invalidación de cachés del cliente: PR 5, con una lectura al abrir y sin prefetch.

#367 sigue abierto: este PR no lo resuelve.
