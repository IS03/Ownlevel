# #367 — PR #441: resultado negativo (descartado como vía de producción)

**Decisión de Dirección, 11/11/2026:** el contraste predictivo secuencial de #441 (`codex/367-protein-energy-prototype`,
head `dc0f3b5`) **no se lleva a producción y su campaña reservada no se ejecuta**. Este documento conserva por qué.

**Alcance de la evidencia:** inspección de código y un cálculo analítico. **No se ejecutó la campaña reservada (38.400
historias) ni ninguna simulación.** El resultado es una esperanza matemática, no una medición empírica.

## Qué proponía

Comparar dos pronósticos de la energía posterior a la sesión (escala 1–5): uno basal y otro que agrega la proteína
registrada en las 3 horas previas. La evidencia se acumula con un e-process de Bernstein empírico sobre la diferencia de
RPS dividida por 4, con apuestas fijas `λ ∈ {1/16, 1/8, 1/4, 1/2, 3/4}`, y alerta al llegar a `E ≥ 200` (α = 0,005).

## Qué está bien

- **El control de error es correcto.** Con pérdidas acotadas en [−1, 1] y centro previsible 0, cada factor cumple
  `exp(λz − ψ(λ)z²) ≤ 1 + λz`; el proceso es una supermartingala bajo «ventaja esperada no positiva» y la cota de Ville
  vale para cualquier cantidad de miradas.
- **La ingeniería de integridad es reutilizable:** pronósticos comprometidos antes de la respuesta, recibos inmutables,
  repetición idéntica, invalidación ante revisiones, abstención fuera de soporte, protocolo con hash previo a la reserva.

## Por qué se descarta

**1. No puede alcanzar su umbral con los efectos de su propio protocolo.** Esperanza exacta de la evidencia con un
pronosticador oráculo (conoce la ley verdadera; es una cota superior de cualquier modelo ajustado), sobre los escenarios
positivos `B` de `scenario-generator.ts`:

| Escenario | Ganancia RPS por pronóstico | Crecimiento de log E por pronóstico | Pronósticos necesarios | log E esperado a 24 / 36 meses |
|---|---:|---:|---:|---:|
| ±15 pp en P(energía ≥ 4) | 0,0051 | 0,00062 | 8.600–11.200 | 0,29 / 0,48 |
| ±30 pp | 0,0203 | 0,00256 | 2.100–2.700 | 1,20 / 2,00 |

El umbral es log 200 = 5,30. El generador produce como máximo ~470 pronósticos puntuables a 24 meses y ~780 a 36, con
seis sesiones por semana y respuesta completa. El criterio de utilidad del protocolo (detección ≥ 80 %) quedaría cerca
de 0 %.

**2. La viabilidad de desarrollo no lo anticipó** porque su efecto sintético dio ganancias de 0,27–0,49 por pronóstico:
entre 13 y 100 veces las de los escenarios positivos nominales.

**3. El límite es de información, no de calibración.** Aun con la apuesta óptima sin tope, el crecimiento es
`μ²/2σ² ≈ 0,0066` por pronóstico para ±30 pp: ~800–1.050 pronósticos. Comparar pronósticos detecta una asociación a
través de un efecto de segundo orden (la varianza explicada), y por eso pide varias veces más datos que contrastarla
directamente.

**4. Aunque alertara, no responde la pregunta del producto.** Cubre una exposición y un resultado (energía, no
rendimiento), declara `associationDirection: "not_inferred"`, y no existen pronósticos comprometidos en producción: el
reloj empezaría en cero.

## Qué se conserva

- La rama y el PR quedan como referencia; no se fusionan.
- Aprendizajes que pasan al [protocolo de preguntas preregistradas](367-preguntas-preregistradas-protocolo.md):
  compromiso previo a los datos, recibos inmutables por mirada, presupuesto de riesgo de por vida sin renovación,
  abstención explícita, y una sola corrida reservada sin ajustes posteriores.
- La lección de método: **calcular la potencia analíticamente con los efectos nominales antes de presupuestar una campaña.**

## Reproducir el cálculo

Para cada nivel previo (2, 3, 4) y cada proteína del generador (0, 5, 15, 30, 50, 80 g): ley verdadera
`scenarioProbabilities`; pronóstico basal = la misma ley con el desplazamiento promedio; `z = (RPS_basal − RPS_oráculo)/4`.
Con `E[z]` y `E[z²]`, el crecimiento por pronóstico es `max_λ { λ·E[z] − (−log(1−λ) − λ)·E[z²] }`.
Resultados: ±15 pp → `E[z] = 1,27e-3`, `E[z²] = 5,27e-4`; ±30 pp → `E[z] = 5,07e-3`, `E[z²] = 1,95e-3`.
