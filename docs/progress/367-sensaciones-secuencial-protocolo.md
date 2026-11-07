# #367 — Protocolo definitivo de una validación reservada secuencial

**Prerregistro, anterior a la corrida reservada.** Base: `main` `f32289a9bb63420d5b5d589da0521eff48ec91c1` (#419). Este documento y el [JSON ejecutable](367-sensaciones-secuencial-protocolo.json), simulador, runner y pruebas se commitean antes de ejecutarla. No son resultados. Método experimental aislado: `insights-feeling-sequential/1`. Ninguna asociación se publica, cualquiera sea el resultado. **El 1 % sigue siendo un objetivo propuesto, no una tolerancia aprobada.**

## Decisiones que cierran las ambigüedades

- **Tamaño:** 1.000 historias por escenario; 9 nulos y 4 escenarios de potencia, hasta 13.000 historias. No 1.000 repartidas entre escenarios.
- **Horizontes anidados:** cada historia genera 37 meses fuente como buffer y se observa hasta los aniversarios de 24 y 36 meses de su primer día elegible. Sus primeras 8 y 12 fechas trimestrales forman ambos horizontes, incluidos los aniversarios. Son las mismas 1.000 historias en cada horizonte: **no se suman a 2.000 independientes**. La viabilidad anterior terminaba el 31/12 antes del aniversario de enero y por eso tenía 7 miradas, no 8.
- **Primera fecha y numeración:** el ancla de cada resultado se obtiene de un prefijo disponible del primer mes; no del futuro. Calendario de #419, cada tres meses desde ella. Una fecha sin 20 pares en ningún candidato no evalúa ni consume índice k. Se informa fecha calendario/slot por separado del k evaluado. Si no existe ancla inicial o se agota el buffer, es fallo del simulador, no se remuestrea.
- **Intervalos:** Wilson **bilateral al 95 %, z = 1,96** por celda escenario × horizonte. El criterio usa su cota superior, no el porcentaje puntual. Para 1.000 historias, **0–3**, no 0–4, son compatibles con la cota superior ≤ 1 %. Cuatro dan aproximadamente 1,024 %. No se combinan escenarios ni horizontes para mejorar el intervalo. Son intervalos marginales, no una banda conjunta al 95 % para todas las celdas.
- **Regla de decisión:** completar los nueve nulos. Todos sus 18 intervalos deben tener cota superior ≤ 0,01 para continuar a potencia. Si alguna cota la supera, detener esta línea; si el intervalo incluye el objetivo, es **evidencia insuficiente**, no aprobado. Si la cota inferior supera 0,01, hay evidencia de exceso bajo ese escenario. Ambas situaciones incumplen el criterio de continuación. No calibrar ni repetir.
- **Potencia condicional:** solo si todos los nulos cumplen, correr los cuatro escenarios de potencia. Si no, informar potencia **no ejecutada por la regla preregistrada**, sin sustituirla por la viabilidad previa. Esta parada forma parte de la única campaña; no se detiene por una fluctuación durante las primeras historias.
- **No hay umbral de potencia aprobado.** Se informa con intervalos, por resultado/candidato, por mirada y acumulada. Cumplir los nulos tampoco habilita una publicación.

## Método congelado

Se usa `evaluateSequential` de #419 sin alterar código, parámetros, estratos, compuertas ni resolución:

- resultado ordinal separado de energía/fatiga posterior, con el marco previo de `prepareFeelingAssociations`;
- una sesión finalizada por día cerrado; captura posterior y previa según reglas existentes;
- solo día lógico anterior y ventanas de comidas explícitas anteriores al inicio;
- **sueño declarado y no declarado fuera**, incluido el sueño del mismo día de una sesión de madrugada;
- rutina × bloque de 42 días; estratos pequeños excluidos; mínimo 40 pares conservados; |ρ| ≥ 0,30; mitades mismo signo/|ρ| ≥ 0,15; 5 observaciones fuera de la moda;
- α_k = 0,005/[k(k+1)] por resultado; B_k = ceil(10/α_k), sin truncarlo por tiempo o para ahorrar en la campaña;
- recorte de #419: 10 excedencias solo si su cota impide pasar; candidato detenido sin p;
- permutaciones con la semilla de esa historia, compartida entre miradas/resultados como en la viabilidad. La cota entre resultados no requiere independencia.

La familia elegible prevista es de 12 por resultado: seis métricas anteriores, cuatro nutrientes anteriores y dos ventanas de carbohidratos. El sueño agregado al simulador produce tres candidatos adicionales **excluidos**; ninguna ventana de fase 2 entra. El máximo mantiene toda la familia testeable, incluso candidatos que no pasan las compuertas descriptivas.

## Fuentes sintéticas y escenarios

Se reutiliza `simulateSource` de #417: inicio 06/01/2020, entrenamiento con probabilidad 4/7 por día, seis métricas AR(0,3) presentes aproximadamente el 80 %, ausencia conjunta de previas del 15 %, resultados ordinales con sus ruidos y marco previo. La generación usa 37 meses (redondeo de 30,44 días/mes); las tendencias se normalizan por esa longitud fija. **Los horizontes no cambian la generación ni consultan registros posteriores.**

El incremento agrega filas `meals`, no valores precocinados de candidatos:

- tres comidas por día generado; en días de entrenamiento, una 90 min antes y otra 30 min después del final; la restante a las 08:00;
- 20 % de sesiones 00:45–01:45 de Córdoba; las demás 18:00–19:00. La comida previa puede pertenecer a la fecha anterior;
- carbohidratos de la comida previa: AR con media 55 g y escala 15 g, redondeados y limitados a 5–140 g; dependencia, tendencia, eras y rutinas según escenario; otras comidas con cantidades independientes;
- horario incierto en 10 % de las comidas (40 % en `uncertain_timing`), repartido entre `registration_now`, `default_clock` y procedencia nula. El 20 % de esas comidas no tiene timestamp. Ninguno adquiere evidencia explícita por contener una hora;
- faltantes independientes: carbohidratos 5 %, proteína 8 %, grasa 8 %, kcal 4 %. En ausencia selectiva, carbohidratos faltan con probabilidad 50 % cuando la fatiga posterior base es ≥ 4;
- kcal se generan antes de retirar valores: un macro ausente no se reconstruye ni se convierte en cero para el análisis;
- sueño diario declarado presente como prueba de exclusión. No se usa su resultado para modificar reglas.

**Disponibilidad:** sesiones solo después de finalizar; sensaciones después de la última captura + 1 min; comidas según su instante simulado + 2 min (aunque su hora no se conozca en la fila); métricas a las 23:50 de su fecha lógica. Cada mirada corta por recepción/disponibilidad **y** fecha lógica, reconstruye el contexto y rankea únicamente ese prefijo. Las definiciones de métricas son fijas y conocidas desde el inicio. Es un modelo de carga append-only: no acredita manejo de ediciones retroactivas o definiciones aparecidas tarde en producción.

Los nueve nulos son los ya propuestos:

| Escenario | Diferencia respecto del base |
|---|---|
| `independent` | Sin efecto de exposición sembrado; marco previo compartido entre sensaciones. |
| `autocorrelated` | AR(0,7) en series y estados. |
| `trend` | Derivas de #417 en métricas/resultados; deriva suave en carbohidratos. |
| `routine_change` | Eras de 182 días, con rutina registrada. |
| `unrecorded_change` | Mismas eras, sin identificarlas en la rutina. |
| `alternating_routines` | Rutinas A/B alternadas, desplazamientos de exposición y resultado. |
| `selective_absence` | Ausencia ligada al resultado, además de faltantes base. |
| `uncertain_timing` | Respuestas posteriores tardías de #417 y mayor incertidumbre horaria de comidas. |
| `reverse_same_day` | La métrica del mismo día depende del resultado posterior; ese candidato debe quedar afuera. |

Son nulos de **ausencia de efecto directo sembrado**; confusión, autocorrelación o selección pueden producir asociación observada. Su error se mide como estrés del método, sin prometer que la permutación la corrija.

Potencia: `previous_moderate`, `previous_strong`, `meal_moderate`, `meal_strong`. Se modifica la energía posterior base sumando `round(s·x)` y fatiga posterior restando `round(s·x)`, cada una limitada a 1–5. Son efectos generativos sobre dos respuestas con ruido propio, **no una inversión ni un score analítico**. s = 0,6 / 1,2, fijados a partir de la viabilidad anterior, sin tantearlos en reservado. Para métrica, x es M0 del día anterior (sin efecto añadido cuando no está registrada); para comida, x = (carbohidratos verdaderos de la comida previa − 55)/15, también cuando no quedó registrada. Solo el candidato M0/anterior o carbohidratos/pre_3h cuenta como objetivo de potencia. Señales en otros candidatos no sustituyen su detección.

**Límites conservados:** “anterior” no acredita que una declaración retrospectiva sea veraz. La ventana publicada de carbohidratos mantiene su ámbito `session_date`: una comida sin hora de la fecha anterior puede no invalidar una ventana de madrugada. Se prueba y declara; no se cambia de método encubiertamente. La prueba no acredita calibración para universos de fuentes distintos.

## Semilla, integridad y reanudación

- Semilla reservada nueva: **0x9c67e2b5 = 2624053941**, no usada en las pruebas de desarrollo.
- Semilla por historia: `(base + imul(indiceEscenario·1000 + indiceHistoria + 1, 0x9e3779b1)) >>> 0`. El multiplicador impar produce streams distintos en los 13.000 identificadores. El orden de workers no altera la identidad. Las comidas usan un stream auxiliar XOR 0x74c93a21.
- Un solo directorio: `tmp/insights-sequential-reserved-v1` (ignorado en Git). El manifiesto se crea exclusivamente, con commit del protocolo, hashes SHA-256 de protocolo/implementación/dependencias (texto normalizado a LF), Node, esbuild, plataforma y arquitectura.
- Solo `--resume` permite continuar: misma identidad, versiones y archivos sellados. No cambiar semilla, escenarios, tamaños, orden de fases o presupuestos. Un lock impide dos runners activos.
- Checkpoint atómico, exclusivo y con checksum **por historial completado**. Se guarda antes de asignar otro al worker. El informe agrega una vez cada identificador. Un historial interrumpido sin checkpoint se recalcula idéntico; no se cuentan dos copias. Un checkpoint corrupto detiene la campaña, no se descarta silenciosamente.
- Workers aíslan el cálculo síncrono; el padre cede el hilo y escribe progreso cada 10 s. Cada worker cede entre miradas e historias. Una interrupción técnica no es un nuevo intento estadístico; se continúa el mismo ledger y no se inspecciona para ajustar parámetros.

## Criterios de reporte y costo reservado

Primario en cada nulo/horizonte: fracción de historias con **algún paso de cualquier candidato, resultado o mirada**, con Wilson; no porcentaje de miradas ni de candidatos. Además: por resultado; potencia objetivo por mirada y acumulada; exclusiones de candidatos y días; pares disponibles y conservados por estratos; permutaciones realmente usadas; tiempos, CPU y RSS muestreada. Las sumas de cobertura sobre miradas son medidas repetidas: no son personas o días únicos adicionales.

Se reserva CPU **local**, sin red/base de datos: hasta 8 workers, dejando al menos dos núcleos lógicos al sistema. Node 22.18.0 y esbuild 0.28.2 existentes del lock. Referencia de costo: la viabilidad previa estimó 15 min para nueve nulos y 5 h CPU para dos efectos a 24 meses; más filas, familia de comidas, 12 miradas y cuatro efectos/dos resultados pueden elevarlo a **20–80 h CPU**, aproximadamente **3–12 h de pared** con ocho workers. Es un presupuesto conservador, no una medición. Límite duro acumulado: **24 h de pared**; si se alcanza, informe incompleto, nunca aprobado. No reducir permutaciones o historias para obtener un resultado.

No se inspeccionan resultados reservados hasta que este protocolo esté en un commit. Las pruebas dirigidas usan exclusivamente otras semillas y presupuestos pequeños o fixtures de software. No se repiten las campañas anteriores. Después se ejecuta **una sola vez**:

```powershell
node scripts/insights/feeling-sequential-validation.mjs
# Solo ante interrupción técnica, sin cambiar código/protocolo/runtime:
node scripts/insights/feeling-sequential-validation.mjs --resume
```

Al terminar se publica el resumen sintético, su identidad y costo, preservando el ledger local. Si incumple el criterio, se documenta y se detiene esta línea. Sin método alternativo automático. Rama con previews bloqueadas, PR borrador, sin merge, migraciones, credenciales, builds Mobile ni QA física.
