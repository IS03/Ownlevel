# #367 — Calibración reservada de preguntas preregistradas: resultados

**Resultado formal: `approved`** (protocolo sintético). Ejecución única, 11/11/2026, autorizada en
[el comentario de #367](https://github.com/IS03/Ownlevel/issues/367#issuecomment-6812450186).
**Esto valida únicamente el protocolo sobre datos sintéticos.** No es una afirmación sobre usuarios reales, no habilita
producción, Mobile, Supabase ni la funcionalidad «Seguimientos». El método y los criterios no se modificaron.

## 1. Resultado formal

- 44.000 historiales, 176 de 176 chunks, una sola invocación, sin errores técnicos.
- **Los 9 nulos cumplen** cota superior 95 % ≤ 5 %. El peor es N7b, con 3,93 %.
- **P25 cumple** cota inferior 95 % ≥ 70 %, con 77,10 % sobre todos los historiales.
- `finalize` se ejecutó una vez y escribió `result.json`; `errors.jsonl` no existe porque no hubo errores.

## 2. Falsas alertas (nulos con criterio, 4.000 historiales c/u)

| Escenario | Respaldada | IC 95 % | Cumple (≤ 5 %) |
|---|---:|---|:---:|
| N1 independiente | 3,00 % | 2,51–3,58 | sí |
| N2 persistencia moderada | 2,95 % | 2,47–3,52 | sí |
| N3 persistencia fuerte | 2,85 % | 2,38–3,41 | sí |
| N4 tendencias | 2,48 % | 2,04–3,00 | sí |
| N5 cambios de rutina registrados | 2,83 % | 2,36–3,39 | sí |
| N6 cambios de rutina no registrados | 3,30 % | 2,79–3,90 | sí |
| N7b falta según la exposición | 3,33 % | 2,81–3,93 | sí |
| N8 pregunta elegida mirando el pasado | 2,85 % | 2,38–3,41 | sí |
| N9 registro escaso | 0,57 % | 0,38–0,86 | sí |

Las tasas observadas (2,5–3,3 %) quedan dentro del alfa nominal del 3,5 %; el mayor margen sobre el 5 % es de 1,07 puntos.
En N9, el 99,1 % de los historiales cerró como «datos insuficientes».

## 3. Potencia (todos los historiales en el denominador)

| Efecto sobre la probabilidad por ejercicio (base 30 %) | Respaldada | IC 95 % | Sin datos suficientes | Estatus |
|---|---:|---|---:|---|
| P10 (+10 pp) | 19,6 % | 17,26–22,17 | 9,5 % | informativo |
| P15 (+15 pp) | 39,4 % | 36,42–42,46 | 9,0 % | informativo |
| P20 (+20 pp) | 62,2 % | 59,15–65,15 | 6,7 % | informativo |
| **P25 (+25 pp)** | **79,7 %** | **77,10–82,08** | 6,0 % | **criterio ≥ 70 %: cumple** |
| P15 con registro escaso | 3,5 % | 2,53–4,83 | 96,3 % | informativo |

Los efectos moderados se detectan menos de la mitad de las veces. Con registro escaso (2 sesiones por semana, 50 % de
cobertura) la pregunta casi nunca llega a una respuesta en dos años.

## 4. Estrés fuera de dominio (sin criterio de aceptación)

| Escenario | Respaldada | IC 95 % | Selectivo / insuficiente |
|---|---:|---|---|
| N7 falta según exposición **y** resultado | 13,7 % | 11,71–15,97 | 27,5 % / 0 % |
| S1 tendencias cortas (20–60 días) | 3,7 % | 2,70–5,06 | 0,3 % / 11,4 % |
| **S2 sesgo anticipatorio** | **9,5 %** | **7,83–11,48** | 5,2 % / 0 % |

### S2, evaluado por separado
- **9,5 % de falsos respaldos, casi el triple del alfa nominal y casi el doble del 5 % aceptado por pregunta.** Es el
  fallo conocido; el dictamen `approved` de los nueve nulos no lo anula, porque S2 estaba fuera del dominio del criterio.
- En el piloto de desarrollo había dado 7,8 % (cota 9,6 %). La reserva lo confirma y es algo mayor: el IC de la reserva
  (7,83–11,48) deja el 7,8 % del piloto en su borde inferior.
- La compuerta de ausencia selectiva frenó solo el 5,2 % de los casos, así que no protege contra este mecanismo.
- **Mecanismo:** la exposición se registra o no según cómo llega la persona a la sesión (estado previo), no según el
  resultado. Registrar la exposición antes de entrenar no lo resuelve.
- **No es un defecto del contraste, sino un límite de identificación:** los datos observados no distinguen esa ausencia
  de una asociación real. N7 (13,7 %) muestra el caso extremo y N7b (3,3 %) la frontera segura.
- S1 queda con cota superior de 5,06 %, apenas sobre el 5 %; no tiene criterio, y su punto (3,7 %) es compatible con el
  alfa nominal.

## 5. Recursos reales

| | Real | Presupuesto |
|---|---:|---:|
| CPU acumulada | **77,1 s** | 600 s |
| Memoria máxima (RSS) | **124 MiB** | 512 MiB |
| Duración (pared) | **~77 s**, una invocación | — |
| Estimación previa | 75–110 s, ~130 MiB | — |

Node 22.19.0, esbuild 0.28.2 (lockfile, `npm ci`), un solo proceso. El tamaño de los resultados es de 5,5 MB.

## 6. Integridad de la ejecución

| Elemento | Valor |
|---|---|
| Commit ejecutado | `bc9a43b688e0782ac9a73446036282ce204a19bd` (HEAD exacto, árbol limpio) |
| `protocolHash` | `4198f72781e82b5c1a6fe7ef86ef567e6b7b1d78f857243ec2859f3e5800c237` |
| `sourceHash` | `708e1b7eb046179589941f11d341dff6ab45ac2a2b974a3e0f654fdc38bf61b1` |
| Namespace | `OWNLEVEL-367-preregistered-RESERVE-20261111-v1` |
| Autorización | manifiesto externo creado con los valores de `plan`; `verify` pasó antes de `run` |
| Invocaciones | 1 (`completed`); sin reanudaciones, borrados ni reinicios |
| `sha256` de `campaign.json` | `d1049e7a8592985f76cea405c0948b2448f14feda849aa3d0a7bf8c86956de32` |
| `sha256` de `result.json` | `46c7a018cfe59ed9a4bef87c4c8d24272865e24efaaf17017ec244d717fac9d8` |
| `sha256` del listado de chunks | `2107c141828d2b418b20d711a0ec5930432e18fceb633f79603f119dba913b13` |

**Auditoría independiente**, hecha leyendo los chunks sin pasar por el código de `finalize`:
- 176 archivos y 44.000 historiales únicos, sin duplicados;
- el hash de protocolo de cada chunk coincide;
- los conteos de «respaldada» de los 17 escenarios coinciden con `result.json`.

Evidencia preservada en `docs/progress/qa/`: `367-preguntas-reserva/` (chunks, `campaign.json`, `result.json`),
`367-preguntas-reserva-plan.txt`, `…-autorizacion.json` y `…-run-stdout.txt`.

## 7. Recomendación

**Viabilidad científica: viable, con un dominio estrecho.**
- Con los datos sintéticos del protocolo, el método controla las falsas alertas en los nueve nulos, con margen
  (peor cota 3,93 %), y detecta con ≥ 77 % un efecto fuerte (+25 pp).
- **Solo es defendible cuando la ausencia de la exposición no depende del estado de la persona.** Cuando depende (S2,
  N7), el error se sale del criterio. Ningún cambio de método lo corrige con datos observados.

**Utilidad de producto: limitada y condicionada.**
- Solo responde bien a relaciones personales fuertes (≥ +20 pp, 62–80 %), en unos 12 meses.
- Los efectos moderados casi no se detectan y los registros escasos no reciben respuesta (96–99 % «datos insuficientes»).
- Sirve como pregunta que la persona elige, no como descubrimiento automático.

**Recomendación:** avanzar a la siguiente etapa solo como oferta opcional («Seguimientos») y con estas condiciones, a
decidir por Dirección:
1. Admitir solo exposiciones de captura previa a la sesión, y priorizar las de captura automática o habitual.
2. Redacción que diga «fue con», nunca «causa», y que el respaldo supone que anotar no depende de cómo se sentía ese día.
3. Mostrar de forma explícita «datos insuficientes» (cobertura y días pareados) en lugar de una respuesta vacía.
4. Exponer el instante de carga de las métricas diarias (EXPAND) antes de admitirlas como exposición.
5. Antes de cualquier afirmación sobre usuarios reales, validar la tasa de registro y el sesgo con datos reales bajo una
   autorización aparte. Una calibración sintética no sustituye eso.

**No cubierto por esta calibración:** arrastre entre sesiones, varias sesiones por día, error de medición de la
exposición, ni datos reales de ningún tipo.
