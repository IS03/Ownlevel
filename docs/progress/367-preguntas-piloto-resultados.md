# #367 — Preguntas preregistradas: piloto sintético de desarrollo y protocolo congelable

**Estado:** piloto de desarrollo terminado, 11/11/2026, sobre `main b6e0cc1`. **No es la calibración reservada:** usa
solo semillas de desarrollo, nunca reutilizables como reserva. Sin producción, Supabase, datos personales ni Mobile.
Reemplaza §2, §4, §5, §6 y §8 del [protocolo preliminar](367-preguntas-preregistradas-protocolo.md) donde difieren.

**Código:** `src/lib/progress/insights-research/preregistered-question/`, que contiene `contrast.ts` (contraste y miradas),
`generator.ts` (historiales sintéticos) y `pilot.ts` (bucle). Runner: `scripts/insights-research/preregistered-pilot.mjs`.
Informes completos: [`qa/367-preguntas-piloto/fase1.json`](qa/367-preguntas-piloto/fase1.json) y
[`fase2.json`](qa/367-preguntas-piloto/fase2.json).

## Veredicto

1. **El contraste es válido en lo que se puede controlar.** En 10 escenarios nulos, que incluyen persistencia fuerte,
   tendencias, cambios de rutina registrados y no registrados, ausencia que depende de la exposición, selección
   retrospectiva de la pregunta y registro escaso, la tasa de «respaldada» falsa quedó entre **0,3 % y 3,3 %**, con cota
   superior del 95 % ≤ **4,6 %** sobre 1.000 historiales por escenario (diseño elegido, fase 2).
2. **Falla, por un límite conceptual, cuando el registro de la exposición depende del resultado:** 13 % de falsos
   respaldos. Ningún método lo corrige con los datos observados. La solución es de producto: solo admitir exposiciones
   **capturadas antes de empezar la sesión** (ver §4).
3. **La potencia es la esperada para una persona, y limitada.** Detecta un efecto de 21 puntos en el 80 % de los casos,
   uno de 17,5 puntos en el 67 % y uno de 13 puntos en el 44 %, con respuesta en ~12 meses (mediana). Quien registra 2
   sesiones por semana casi nunca llega a una respuesta en 2 años.
4. **Costo real, muy por debajo de lo estimado:** ~1,7 ms de CPU por historial. La calibración reservada completa
   costaría **~75 s de CPU**, no 15–45 minutos por diseño.

**Recomendación:** congelar el protocolo de §6 con **N = 120**, **`era_shift`** y **alfa total 3,5 %** (0,007 + 0,028),
después de implementar las tres piezas de §7. Tiene sentido congelarlo: es barato y el método se sostiene. Lo que
Dirección debe decidir es si la utilidad de §3 justifica el producto.

## 1. Validez de las permutaciones circulares (análisis)

**Estadístico.** Para filas pareadas con exposición `a ∈ {0,1}` y resultado `y ∈ [0,1]`, estratificadas por rutina ×
bloque de 28 días: `T = Σ_s Σ_t (a_t − ā_s)·y_t`. Es idéntico a `Σ_s w_s(ȳ_alto − ȳ_bajo)` con `w_s = n_alto·n_bajo/n_s`
(prueba 1).

**Condición de exactitud.** El p de aleatorización con un grupo `G` de rotaciones es exacto si, bajo la hipótesis nula, la
ley condicional de `a` dado `y` es invariante bajo `G`. Basta con que `a ⊥ y` dentro de cada unidad **y** que la ley de
`a` sea invariante a rotaciones cíclicas en cada unidad.

**Independencia y autocorrelación no alcanzan.**
- Un segmento AR estacionario no es cíclicamente invariante: la rotación junta el último día con el primero.
- Una tendencia tampoco lo es.

**Evidencia exacta (enumeración completa, sin simulación):**
- **Ley invariante** (prueba 3): dos estratos de 6 y 5 filas, el grupo producto completo de 30 rotaciones y todas las
  configuraciones de `a`. La tasa de rechazo exacta nunca supera α, en α ∈ {0,05; 0,1; 0,2; 0,3} y para cinco pares de
  conteos. El máximo es igual a α.
- **Contraejemplo** (prueba 4): `a` independiente de `y`, pero con probabilidad creciente en el tiempo, y `y` creciente.
  `P(p ≤ 0,25) = 0,632`, frente al 0,25 nominal. **Independencia sin invariancia puede inflar el error de forma grosera.**

**Consecuencia.** La validez en datos reales es aproximada y depende de cuánto se rompa la invariancia dentro de cada
unidad. Por eso se midió en lugar de suponerla.

**Por qué resistió los nulos del piloto:**
- Centrar `y` dentro de bloques de 28 días absorbe derivas lentas y cambios de etapa registrados.
- Las sesiones submuestrean los días y debilitan la persistencia.
- Dicotomizar la exposición reduce la influencia de los extremos.

**No está demostrado** para tendencias fuertes dentro del propio bloque en ambas series a la vez, ni para efectos de
arrastre de un día al siguiente. Son riesgos residuales declarados.

**`stratum_shift` frente a `era_shift`.**
- `stratum_shift` rota dentro de cada estrato.
- `era_shift` rota a lo largo de toda la etapa de rutina, con el mismo estadístico por bloques.
- En la fase 1 fueron equivalentes: diferencias de 0–1,8 puntos, sin un patrón consistente.

Se elige **`era_shift`**:
- Su grupo de rotaciones es mucho mayor cuando hay pocos estratos informativos. Con estratos de ~5 filas, la rotación
  dentro de cada estrato deja una distribución nula muy gruesa.
- Su único supuesto extra (invariancia aproximada a lo largo de la etapa) no mostró costo en los nulos con tendencias.

## 2. Falsas alertas

Evento: una pregunta sobre un historial sin relación real termina «respaldada» en cualquiera de sus dos miradas.

**Fase 2** (diseño elegido: N = 120, `era_shift`, alfas 0,007 / 0,028; 1.000 historiales por nulo; namespace de desarrollo
`…-DEV-pilot-2`):

| Escenario nulo | Respaldada | Cota sup. 95 % | Sin datos suficientes | Registro selectivo |
|---|---:|---:|---:|---:|
| N1 independiente | 3,1 % | 4,4 % | 7,9 % | 0,2 % |
| N2 persistencia moderada (φ 0,5) | 2,2 % | 3,3 % | 9,5 % | 0,4 % |
| N3 persistencia fuerte (φ 0,85 / 0,75) | 3,3 % | 4,6 % | 9,0 % | 0,1 % |
| N4 tendencias (senos y caminatas aleatorias) | 3,2 % | 4,5 % | 11,0 % | 0,7 % |
| N5 cambios de rutina registrados, causa común | 3,2 % | 4,5 % | 9,1 % | 0,3 % |
| N6 cambios de rutina **no** registrados | 2,4 % | 3,5 % | 10,8 % | 0,1 % |
| N7b falta la exposición según la exposición | 3,3 % | 4,6 % | 4,5 % | 0 % |
| N8 pregunta elegida mirando el pasado (máx. de 12) | 2,1 % | 3,2 % | 9,8 % | 0,5 % |
| N9 escaso (2 sesiones/semana, 50 %) | 0,3 % | 0,9 % | 99,6 % | 0 % |
| **N7 falta la exposición según exposición y resultado** | **13,0 %** | **15,2 %** | 0 % | 24,2 % |

**Calibración aparte de las compuertas.** En la mirada final, la fracción de p ≤ 0,10 entre los historiales evaluados fue
de 8,9–10,4 % en todos los nulos salvo N7 (esperado: 10 %).

**Hallazgos de la fase 1** (500 historiales; ambos diseños y variantes; alfas 0,008 / 0,032):
- Rango de 2,0–4,8 % en N1–N6, N7b y N8.
- La única inflación leve fue N6 (cambios no registrados): 4,0–4,8 %, y una fracción de p ≤ 0,10 de 13–15 %.
- Bajar el alfa total a 3,5 % deja margen para N6 sin perder potencia apreciable. Se decidió **en desarrollo**, antes de
  cualquier reserva, que es justamente el propósito de esta fase.

**N7 (registro selectivo).** La compuerta de ausencia selectiva (diferencia ≥ 0,15) solo bloqueó el 24 % de los casos.
Cuando el registro depende a la vez de la exposición y del resultado, la asociación está en los datos observados: ninguna
permutación ni compuerta la distingue de una real. N7b confirma la frontera: si la falta depende solo de la exposición, no
hay sesgo (3,3 %). **Regla de producto obligatoria:** ver §4.

## 3. Potencia y utilidad

Mismo diseño y fase. Efecto planteado sobre la probabilidad por ejercicio de quedar en baja, con base de 30 %, en
historiales realistas: 2–5 sesiones por semana, cobertura de exposición de 50–85 %, cambios de rutina con causa común y
vacaciones. Se incluyen en el denominador todos los historiales, también los que no llegan a la respuesta.

| Efecto (logrado) | d | Respaldada | Cota inf. 95 % | Sin datos suficientes |
|---|---:|---:|---:|---:|
| P10 (9,1 pp) | 0,36 | 25,0 % | 21,0 % | 9,8 % |
| P15 (13,1 pp) | 0,50 | 44,3 % | 39,5 % | 7,5 % |
| P20 (17,5 pp) | 0,67 | 67,3 % | 62,5 % | 9,8 % |
| **P25 (21,2 pp)** | **0,78** | **80,5 %** | **76,3 %** | 6,3 % |
| P15 escaso (2/semana, 50 %) | 0,50 | 3,0 % | 1,7 % | 96,8 % |

**Cuándo llega la respuesta:** la mirada final llega en una mediana de ~12 meses (P90: 20 meses); la primera, en la
mitad. Dentro del estrato, el desvío del resultado quedó en ~0,26, así que 13 pp equivalen a d ≈ 0,5. La pérdida por
estratificar y dicotomizar quedó cerca del valor central supuesto (DE ≈ 2).

**Lectura de producto:**
- Una relación personal fuerte se confirma en 2 de cada 3 casos (17,5 pp) o 4 de cada 5 (21 pp), en alrededor de un año.
- Una moderada (13 pp) se confirma menos de la mitad de las veces.
- Las débiles casi nunca.
- Los registros escasos casi nunca reciben respuesta y cierran como «datos insuficientes», que es lo honesto.

## 4. N = 120 frente a N = 160

Fase 1, `era_shift`; cifras entre paréntesis: N = 160.

| | N = 120 | N = 160 |
|---|---|---|
| Falsos respaldos, rango N1–N8 | 2,2–4,0 % | 2,4–4,6 % |
| Detección P15 / P20 / P25 | 39,7 / 65,7 / 76,0 % | 48,0 / 71,0 / 79,3 % |
| Sin respuesta en 2 años (nulo independiente) | 9,8 % | 25 % |
| Mediana hasta la mirada final | ~12 meses | ~15 meses |

**Decisión: N = 120.** N = 160 gana 3–8 puntos de detección, pero tarda un trimestre más y deja sin respuesta a 1 de cada
4 preguntas, frente a 1 de cada 10. Para una persona, una respuesta en un año pesa más que esa ganancia.

**Regla de producto derivada de N7, obligatoria antes de construir:** una exposición solo puede ser objeto de pregunta si
su **instante de captura** (no la hora declarada) es anterior al inicio de la sesión. Esto incluye comidas cargadas antes
de entrenar, la sensación previa, y sueño o métricas cargadas antes. Hoy `InsightsSource.metricValues` no trae ese
instante (pendiente 1 del protocolo preliminar), así que hace falta un EXPAND antes de habilitar preguntas sobre métricas
diarias. La compuerta de ausencia selectiva se mantiene como respaldo, no como protección.

## 5. Recursos medidos

Equipo local, Node 22.19.0, Darwin arm64, un solo proceso.

| Corrida | Historiales | Evaluaciones | CPU | Pared | RSS máx. |
|---|---:|---:|---:|---:|---:|
| Fase 1 (2 diseños × 2 variantes) | 6.500 | 26.000 | 43,3 s | 39,9 s | 156 MiB |
| Fase 2 (diseño elegido) | 12.000 | 12.000 | 20,9 s | 19,2 s | 124 MiB |

- Total del piloto: ~1,8 minutos de CPU, contando la repetición de la fase 1 (que salió idéntica: 0 de 52 filas cambiaron)
  y dos corridas de humo. El tope era de 15 minutos.
- Costo por historial evaluado: ~1,7 ms.
- Estimación para la calibración reservada de §6 (42.000 historiales): **~75 s de CPU, ~130 MiB**. Tope propuesto: 10
  minutos de CPU y 512 MiB; si se excede, se aborta sin resultado.
- Costo en producción si se construye: dos evaluaciones por pregunta en toda su vida, de ~1–3 ms cada una.

## 6. Protocolo congelable (propuesta v1)

**Método congelado:**
- **Exposiciones admitidas:** solo las de captura previa a la sesión.
- **Unidad:** día pareado.
- **Estadístico:** el de §1, con estratos rutina × bloque de 28 días.
- **Aleatorización:** `era_shift`, 999 rotaciones, p bilateral `(1+#)/(B+1)`.
- **Miradas:** N = 120 días pareados; miradas en 60 y 120; alfas 0,007 y 0,028 (total 3,5 %).
- **Compuertas:** cobertura ≥ 50 %, ausencia selectiva < 0,15 (con ≥ 5 días), ≥ 2 estratos informativos.
- **Horizonte:** 730 días.
- **Una pregunta activa.**

**Escenarios y aceptación:** cada condición se exige por separado, y un resultado incompleto nunca aprueba.

| Grupo | Escenarios | Historiales | Condición |
|---|---|---:|---|
| Nulos | N1, N2, N3, N4, N5, N6, N7b, N8, N9 | 4.000 c/u | Cota sup. 95 % de «respaldada» ≤ 5 % en **cada** escenario |
| Potencia | P25 (d ≈ 0,8) | 1.000 | Cota inf. 95 % de «respaldada» ≥ 70 % |
| Informe | P10, P15, P20, P15 escaso | 1.000 c/u | Se informa, no es condición |
| Estrés, fuera del dominio | N7 | 1.000 | Se informa; documenta por qué rige la regla de captura previa |

**El criterio de potencia baja respecto del protocolo preliminar (de ≥ 80 % a ≥ 70 %)** y lo declaro: el piloto muestra
que el 6–10 % de los historiales con efecto fuerte no llega a 120 días pareados en dos años, por falta de datos y no por
el método. Así, una cota inferior de 80 % es inalcanzable con cualquier test. Si Dirección prefiere mantener 80 %, la
corrida fallará casi seguro y conviene saberlo antes.

## 7. Qué falta para congelar y ejecutar

1. **Runner reservado:** fase `reserved` con el namespace de reserva, autorización externa (manifiesto ligado al hash del
   protocolo y al commit), checkpoint y tope de CPU. Hoy el generador rechaza cualquier namespace que contenga «reserve»,
   a propósito.
2. **Protocolo en JSON con hash**, firmado por Dirección antes de generar la primera historia reservada.
3. **Una sola corrida.** Sin ajustar umbrales después; si falla, se conserva el resultado y un cambio de método exige otro
   protocolo.

Ninguna de las tres toca producción. La regla de captura previa y el EXPAND del instante de carga son requisitos **para
construir**, no para calibrar.

## 8. Límites de este piloto

- Los generadores son sintéticos. No modelan arrastre entre días, efectos por día de la semana, varias sesiones por día,
  ni error de medición de la exposición.
- Tamaños de desarrollo: 500–1.000 historiales por escenario. Sirven para decidir, no para acreditar.
- El desvío del resultado (~0,26) sale del generador. No se midió en datos reales y no hacía falta para decidir.
