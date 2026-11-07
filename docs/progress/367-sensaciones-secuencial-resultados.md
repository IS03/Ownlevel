# #367 — Validación reservada secuencial: no acredita el criterio propuesto

**Línea detenida.** Una sola campaña, sin ajustes posteriores: 9.000 historiales sintéticos completos, 1.000 por nulo, con horizontes anidados de 24/36 meses. Cuatro de nueve nulos no acreditan la cota superior ≤ 1 % en ambos horizontes. Se aplicó la parada preregistrada y **no se ejecutó potencia**. No se publica ninguna asociación; «consistente» sigue deshabilitado. El 1 % es un objetivo propuesto, **no una tolerancia aprobada**.

## Prerregistro e integridad

- Base: merge #419 `f32289a9bb63420d5b5d589da0521eff48ec91c1`.
- Protocolo, simulador, runner y pruebas commiteados/pusheados **antes** de la primera historia reservada: `627861aa32c2d530c07753357e4381dbe13f2a80`.
- [Protocolo definitivo](367-sensaciones-secuencial-protocolo.md) y [JSON ejecutable](367-sensaciones-secuencial-protocolo.json). Semilla nueva `0x9c67e2b5`.
- SHA-256 del protocolo: `96617603c1256723d802c492014a1adfe6945ac7b30a0c38d90e1a8da73e0233`.
- Identidad de ejecución: `382b9ccce894f7cd1d22353725c96c967ad1158bcbfceecc1ab653c99e0bfbdc`.
- Método `feeling-sequential.ts` intacto respecto de #419; SHA-256 LF `6f41a89ac6aa2cec059ec38260d7c215966f3b3e6d016bcf4e24ee0b3db073a5`. Sin cambios en compuertas, α, estratos, familias o permutaciones después de observar resultados.
- Una invocación, sin interrupciones ni reanudaciones. Inicio `2026-11-07T10:03:03.786Z`; último checkpoint `2026-11-07T10:14:00.475Z`.

Los [resultados completos](367-sensaciones-secuencial-resultados.json) incluyen manifiesto, hashes de dependencias, semillas/fechas y detalles de los pasos en los nulos, cobertura y costo. Los 9.000 checkpoints con checksum quedan en `tmp/insights-sequential-reserved-v1/histories/`, ignorados en Git; no son datos de usuarios. La agregación posterior lee esos recibos y el informe: **no vuelve a ejecutar el método**.

## Falsos positivos por historial

Un acierto significa **algún paso en cualquier candidato, cualquiera de los dos resultados y cualquiera de las miradas**. No se suman repeticiones de un mismo historial. Wilson bilateral al 95 %, z = 1,96. Ambos horizontes son lecturas de las mismas 1.000 historias: no 2.000 muestras independientes.

| Nulo | Algún paso, 24 meses | IC 95 % | Algún paso, 36 meses | IC 95 % | Criterio propuesto |
|---|---:|---|---:|---|---|
| `independent` | 2/1.000 | 0,055–0,726 % | 2/1.000 | 0,055–0,726 % | Cumple |
| `autocorrelated` | 7/1.000 | 0,339–1,438 % | 8/1.000 | 0,406–1,571 % | Evidencia insuficiente |
| `trend` | 2/1.000 | 0,055–0,726 % | 2/1.000 | 0,055–0,726 % | Cumple |
| `routine_change` | 4/1.000 | 0,156–1,024 % | 4/1.000 | 0,156–1,024 % | Evidencia insuficiente |
| `unrecorded_change` | 4/1.000 | 0,156–1,024 % | 4/1.000 | 0,156–1,024 % | Evidencia insuficiente |
| `alternating_routines` | 2/1.000 | 0,055–0,726 % | 2/1.000 | 0,055–0,726 % | Cumple |
| `selective_absence` | 1/1.000 | 0,018–0,564 % | 1/1.000 | 0,018–0,564 % | Cumple |
| `uncertain_timing` | 5/1.000 | 0,214–1,165 % | 5/1.000 | 0,214–1,165 % | Evidencia insuficiente |
| `reverse_same_day` | 2/1.000 | 0,055–0,726 % | 2/1.000 | 0,055–0,726 % | Cumple |

**Interpretación:** las estimaciones puntuales quedan entre 0,1 % y 0,8 %. Ningún intervalo demuestra una tasa superior al 1 %, pero ocho de las 18 cotas superiores superan el objetivo. La campaña **no acredita el criterio requerido**; no se presenta como aprobada ni como prueba concluyente de exceso > 1 %. No se agrupan nulos/horizontes para estrechar intervalos. Son nulos de estrés definidos por ausencia de efecto directo sembrado; confusión o selección pueden producir asociación observada.

## Potencia

**No ejecutada**, por la regla condicional registrada antes de la corrida. Los cuatro escenarios reservados —métrica anterior moderada/fuerte y carbohidratos previos moderados/fuertes— no generaron historias ni evaluaciones. No se informa 0 % de potencia ni se reutiliza la viabilidad anterior como medición reservada. Los campos por mirada/resultado del JSON conservan conteos de la fase nula; no representan potencia.

## Cobertura y temporalidad

- Comidas desde filas fuente: hora explícita, `registration_now`, `default_clock`, procedencia nula, timestamp ausente y faltantes independientes de nutrientes. El 20 % de sesiones de madrugada ejercita medianoche.
- Cada mirada usa el prefijo disponible antes de su fecha: sesión finalizada, captura/recepción sintética, fecha lógica y nuevo contexto. Las pruebas alteran valores futuros y comprueban invariancia en las 12 fechas. El rango es `[inicio−3 h, inicio)`; cero y macro ausente permanecen distintos.
- Por resultado/mirada: **12 candidatos elegibles, 14 excluidos**. Sueño declarado/no declarado siempre fuera, incluso con datos presentes; los tres candidatos de sueño no se promueven.
- **215.998 evaluaciones de un resultado en una mirada**, de 216.000 posibles (9.000 × 12 × 2). Dos fechas no alcanzaron 20 pares: conservaron su slot y no gastaron k. Los historiales siguen en el denominador de 1.000.
- Al cierre de 36 meses, por historial y resultado: aproximadamente **532–534 días elegibles de 626–628 sesiones disponibles** sin capturas tardías. En `uncertain_timing`: **402,117 de 627,864**; no se rellena ausencia.
- Cobertura de carbohidratos/pre_3h al cierre: aproximadamente **68,3–68,5 % de los días elegibles** en escenarios base; **59,55 %** en `selective_absence`; **19,50 %** en `uncertain_timing`.
- En este último quedan **78,421 pares/historial**, de los que **44,749** se conservan en estratos suficientes. No se oculta esa pérdida bajo el total de días.
- El JSON distingue cobertura agrupada sobre miradas (`pooledLookCoverage`, medidas repetidas) y al cierre (`closureCoverage`, última mirada por historial/resultado/horizonte), con exclusiones de candidatos y de captura/previa.

Se conserva el límite publicado: una comida sin hora de la fecha anterior puede no invalidar una ventana de carbohidratos de madrugada. No se cambia esa semántica durante la validación. El simulador append-only tampoco acredita reconstrucción de ediciones retrospectivas o definiciones nuevas en producción.

## Costo y recuperación

- Windows, Node **22.18.0**, esbuild **0.28.2**, **8 workers**; paquetes existentes, sin dependencias nuevas.
- **10,95 min de pared; 89,78 min CPU** del proceso Node/hilos. La agregación documental posterior no integra ese tiempo.
- **6.867.481 permutaciones**, con los presupuestos completos de #419, sin recortes para ahorrar.
- RSS máxima **muestreada**, incluidos workers: **959,09 MiB**. No es memoria/latencia productiva ni un SLA.
- 9.000 checkpoints, **608.659.688 bytes** de contenido; publicación exclusiva antes de asignar otra historia. Ambos horizontes comparten esos recibos.
- Cesión del hilo entre miradas/tareas y progreso cada 10 s. Las pruebas cubren segundo runner rechazado, reanudación de recibos completos, publicación parcial, identidad distinta y corrupción. La campaña no necesitó recuperación.

## Verificación y cierre

7 pruebas nuevas de simulación/temporalidad y 4 del runner; 9 vigentes del secuencial y 5 del estratificado: **25 pruebas dirigidas aprobadas**, con dos mediciones opcionales de viabilidad omitidas. No se repitieron campañas anteriores. Typecheck de raíz y ESLint dirigido, sin errores. Los consumidores y el código analítico previo permanecen intactos; no se repitieron suites Mobile/backend ajenas.

Previews bloqueadas para `codex/367-feeling-sequential-validation`. **Sin merge, migraciones, producción, builds Mobile, QA física ni lectura de tokens de autenticación.** La línea se detiene: sin recalibrar, reintentar para aprobar o inventar otro método automáticamente.
