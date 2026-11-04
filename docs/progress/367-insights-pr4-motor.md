# Insights #367 — PR 4: motor, read model y calibración

Método **`insights-engine/1`**, contrato **`performance-insights/1`**, sobre el comparador [`insights-performance/1`](367-insights-pr1-comparador.md). Dominio puro en `src/lib/progress/insights-engine`, compartido por la API y por Expo. Ruta nueva y optativa: `GET /api/mobile/v1/progress/performance-insights`. **Sin UI, migraciones, datos personales, deploys ni builds.** La experiencia está propuesta en [bocetos/insights/PLAN.md](../../bocetos/insights/PLAN.md) y se implementa en PR 5.

**Dependencias.** Sale de main y no usa código exclusivo de #383: la tabla `workout_session_feelings` ya está publicada. Sin #383 mergeado no llegan sensaciones nuevas de los clientes, así que esos candidatos quedan en «datos insuficientes». `vercel.json` bloquea las previews de esta rama; si #380, #383 y este PR se integran en cualquier orden, ese archivo puede dar un conflicto trivial de una línea.

## Tres carriles

| Carril | Contiene | Límite |
| --- | --- | --- |
| **Hechos** | Estado por ejercicio, sesión y día del comparador; referencia, antigüedad, récords separados, denominadores y exclusiones | Un descenso son registros inferiores, no pérdida de capacidad |
| **Contexto** | Sensaciones pre y post, métricas del día, nutrición registrada, carbohidratos previos y metadata legacy | Es lo registrado alrededor; no afirma relación |
| **Asociaciones** | Candidatos preespecificados contra la proporción diaria de descensos | Máximo «exploratorio»; `promotion.status = not_enabled` |

## Decisiones de datos

- **Historial completo:** siete flujos paginados, sin período ni truncamiento. La salida se pagina con `before` y `limit` (14 días por defecto, máximo 120), y siempre informa el total. `association=<id>` agrega los pares de una relación con sus sesiones.
- **Unidad:** se deriva del `weight_mode_snapshot` histórico, que define qué guarda el campo. Nunca del catálogo vigente.
- **Configuración:** el producto nunca la capturó. El adaptador usa la identidad opaca `not_captured_by_product`, distinta del `none` verificado del PR 1, y el contrato lo declara en `limits.configurationCaptured = false`. Es una decisión reversible que conviene revisar: dos sesiones del mismo UUID, modo e implemento se comparan aunque cambie un agarre no registrado.
- **Snapshot ausente:** si falta modo o implemento, queda `insufficient_comparison` con motivo.
- **Hora de comida:** `nutritionMealTimeKnown` da por conocida una hora sin marca. Acá se exige más: si `consumed_at` coincide con `created_at`, es el valor por defecto de la columna y cuenta como `registration`. Solo `explicit` entra en el valor primario. No hizo falta migrar.
- **Faltantes:** día sin comidas, métrica sin valor o macro `null` quedan fuera y se cuentan por motivo. Un macro `null` deja el total como parcial, nunca como cero. Un cero registrado sí es un valor.
- **Día abierto:** hoy no entra en asociaciones, porque su ingesta y sus métricas siguen abiertas. Sí aparece en hechos, con `openDay`.
- **Ingesta:** todo se nombra como registrado; `limits.ingestionCompleteKnown = false`.
- **Consistencia:** se compara una revisión de las siete fuentes (cantidad de filas y último cambio) antes y después de leer, con un reintento. Si sigue cambiando, responde 503: nunca publica una lectura parcial. Una sesión en curso no la altera.
- **Errores:** un flujo fallido o un número ilegible da 503, no un historial vacío. `integrity = conflicting_duplicates` llega sin filas y no significa vacío.

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
- **Exploratorio:** al menos 20 pares y 5 por grupo, p ≤ 0,05, |rho| ≥ 0,25, |rho local| ≥ 0,15 y sin ausencia selectiva.
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

**Evaluación del 1 %: no aprobado y hoy no alcanzado en todos los escenarios.** Queda por debajo en independencia, dependencia temporal, outliers, ausencia selectiva y múltiples candidatos. Cambios de rutina lo supera (1,8 %), y en tendencias el punto queda debajo pero su intervalo no descarta superarlo. Por eso «consistente» sigue fuera del contrato.

**Qué haría falta antes de habilitarlo:** decidir el presupuesto de riesgo y estratificar por etapa de rutina, ya que los residuos locales no absorben un cambio simultáneo en exposición y resultado. Exploratorio aparece hasta en un 23 % de los historiales nulos con deriva o cambios de rutina, así que debe quedar solo en detalle y con un texto que no afirme que se repite.

**Iteración registrada.** La primera campaña (300 historiales, p ajustada ≤ 0,05) dio 1,3 % en dependencia temporal, 2,7 % en tendencias y 3,3 % en rutina. Se endureció la p ajustada a 0,01 por las 12 actualizaciones anuales, y se exigió también efecto local para exploratorio. Esos ajustes se decidieron con historiales nulos, no con resultados de una persona ni eligiendo ventanas. Antes, una prueba detectó que la mediana unilateral de los bordes inducía correlación entre series con tendencia; se corrigió con la ventana simétrica.

**Límites:** son modelos sintéticos elegidos por nosotros, no una garantía sobre historiales reales. La alternativa de referencia con varias exposiciones anteriores no se calibró.

## Escala

Solo cálculo, con perfiles sintéticos y 499 permutaciones. Los objetivos eran propuestas de la Etapa 0, no compromisos.

| Perfil | Sesiones | Series | Valores de métricas | Comidas | Candidatos | Cálculo (máx.) | Respuesta | Memoria adicional | Consultas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 año | 218 | 5232 | 2323 | 1460 | 28 | 114 ms | 70 KiB | 34 MiB | 30 |
| 5 años | 1311 | 31 464 | 29 127 | 7300 | 52 | 873 ms | 104 KiB | 114 MiB | 96 |
| 10 años intensos | 3137 | 125 480 | 87 679 | 18 250 | 72 | **4,5 s** | **141 KiB** | **479 MiB** | 280 |
| Objetivo | | | | | | ≤ 1 s | ≤ 128 KiB | ≤ 128 MiB | |

El perfil de 10 años supera los tres objetivos. No se trunca: si esa escala se vuelve real, hay que revisar la arquitectura de forma explícita.

**Consultas:** `suma(páginas de cada flujo) + 14`. Crecen con las filas, no con ejercicios, sesiones ni candidatos. La Etapa 0 proponía 2 comprobaciones de revisión; sin una RPC nueva son dos rondas de 7 consultas cada una.

**PostgREST local real**, sobre esquema completo (89 migraciones), con usuarios sintéticos, token real y RLS. A 5 años, con 7746 series (el seed crea menos series por ejercicio que el perfil de arriba): lectura consistente 568–623 ms y cálculo 723–797 ms. Son loopback y Docker en esta PC: **no representan la latencia de producción**.

Tres optimizaciones salieron de esas mediciones, sin cambiar resultados:

- El comparador suma `exclusionDetail: "summary"`, que deja de crear una fila por cada sesión posterior; se generaban 776 580 objetos a 5 años. El valor por defecto no cambia.
- `uniqueRows` ya no calcula la huella de filas sin duplicado, y el modo normalizado se memoiza.
- Ejercicios y series se leen sin `join` y se filtran en memoria contra las sesiones completadas. Bajó de 4,3 s a 0,6 s, siempre bajo RLS.

## Validación

- `engine.test.ts`: 19 fixtures de decisiones exactas. `calibration.test.ts`: 2 reproducibles para CI. `scale.test.ts`: 1. `performance-insights.test.ts`: 6 de ruta y loader. Comparador: 67, con 1 nueva.
- `performance-insights.local.test.ts`: 2 contra Supabase local descartable, que se omiten sin su configuración. Verifican los `select` reales, que el token del dueño no lee filas ajenas al pedirlas y que sin identidad se rechaza. La instancia se eliminó al terminar.
- Tipos raíz y Mobile, y lint focalizado.
- **Sin ejecutar:** el endpoint en producción, ni contra datos reales.

## Pendientes

- Decisión del presupuesto de riesgo y estratificación por rutina.
- PR 5: pantallas, entrada post-entreno y su QA física, que queda diferida hasta que se avise.
- Revisar con datos reales qué tan seguido falta `implement_snapshot`, sin consultar datos personales fuera de una decisión explícita.
- Unificación futura con «Qué influye», solo después de OBSERVE.
- Invalidación de cachés del cliente: PR 5, con una lectura al abrir y sin prefetch.

#367 sigue abierto: este PR no lo resuelve.
