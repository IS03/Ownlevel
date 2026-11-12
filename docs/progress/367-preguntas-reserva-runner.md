# #367 — Preguntas preregistradas: runner de calibración reservada (preparado, no ejecutado)

**Estado:** 11/11/2026, sobre `main 593bf54`. El runner y el protocolo están listos para revisión. **La campaña reservada
no se ejecutó y no se generó ninguna historia con el namespace reservado.** Sin producción, Supabase, datos personales ni
Mobile. Continúa [el piloto de desarrollo](367-preguntas-piloto-resultados.md).

## 1. Qué hay que autorizar

| Dato | Valor |
|---|---|
| Protocolo | `preregistered-question-reserved/1` |
| `protocolHash` | `4198f72781e82b5c1a6fe7ef86ef567e6b7b1d78f857243ec2859f3e5800c237` |
| `sourceHash` | `708e1b7eb046179589941f11d341dff6ab45ac2a2b974a3e0f654fdc38bf61b1` |
| Namespace reservado | `OWNLEVEL-367-preregistered-RESERVE-20261111-v1` |
| Commit | el `HEAD` del checkout donde se corra, con los archivos fuente sin cambios |

- El `protocolHash` identifica método, escenarios, tamaños, criterios y presupuestos. Está en el manifiesto versionado
  [`367-preguntas-reserva-protocolo.json`](367-preguntas-reserva-protocolo.json), y una prueba exige que coincida con el
  código.
- El `sourceHash` identifica el contenido de los 8 archivos que definen la corrida. No cambia al fusionar si esos archivos
  no cambian.
- El commit **sí** cambia al fusionar. Por eso la autorización se firma después, sobre la salida de `plan` en el checkout
  final:

```bash
node scripts/insights-research/preregistered-reserved.mjs plan
```

`plan` imprime los tres valores y la plantilla exacta del manifiesto de autorización. No genera historias ni escribe nada.

## 2. Protocolo congelado

- **Método:** N = 120 días pareados, miradas en 60 y 120, `era_shift`, 999 permutaciones, alfas 0,007 + 0,028, bloques de
  28 días, horizonte de 730 días, compuertas de cobertura ≥ 50 %, ausencia selectiva < 0,15 y ≥ 2 estratos informativos.
- **Alfas explícitas:** el runner las pasa siempre al contraste. `validateProtocol` rechaza los valores por defecto del
  código (0,008 / 0,032) y cualquier otra inconsistencia.
- **Semillas:** derivadas del namespace reservado, distinto de los tres namespaces de desarrollo ya usados.

| Grupo | Escenarios | Historiales | Criterio |
|---|---|---:|---|
| Nulos | N1, N2, N3, N4, N5, N6, N7b, N8, N9 | 4.000 c/u | Cota sup. 95 % de «respaldada» ≤ 5 % en cada uno |
| Potencia | P25 | 1.000 | Cota inf. 95 % ≥ 70 % sobre todos los historiales |
| Informe | P10, P15, P20, P15 escaso | 1.000 c/u | Sin criterio |
| Estrés fuera de dominio | N7, S1, S2 | 1.000 c/u | Sin criterio |

Total: 44.000 historiales en 176 chunks. **Decisión:** `approved` solo si la campaña está completa y verificada, sin
errores técnicos, dentro del presupuesto, y se cumplen todos los criterios. Cualquier criterio incumplido da `rejected`.
Cualquier faltante da `incomplete`, que nunca aprueba.

**Cambio respecto de lo aprobado, anterior al congelamiento:** agregué S1 y S2 como estrés **sin criterio**. No tocan el
método ni la regla de decisión. Suman 2.000 historiales (de 42.000 a 44.000). Motivo en §5.

## 3. Garantías del runner y cómo se probaron

Comandos: `plan`, `verify <autorización>`, `run <autorización> [--resume]`, `finalize` y `rehearsal <dir>`. No hay opciones
de tamaño, semilla ni escenario. La salida reservada va a una carpeta fija del repo: `docs/progress/qa/367-preguntas-reserva`.

| Garantía | Mecanismo | Prueba |
|---|---|---|
| Sin autorización no se ejecuta | `authorize` corre antes de crear archivos o derivar semillas; el generador rechaza el namespace reservado sin un permiso emitido por `authorize` | 1, 3 |
| Hash, fuente o commit incorrecto → rechazo | Comparación exacta contra el entorno; árbol sucio también rechaza | 2 |
| Configuración alterada → rechazo | `validateProtocol`; un protocolo reservado debe ser idéntico al congelado; reanudar con otro hash se rechaza | 5 |
| Interrupción y reanudación → mismo resultado | Chunks atómicos, nunca sobrescritos ni recalculados, verificados por hash | 4 |
| Resultado parcial nunca aprueba | `finalize` lee solo de disco y exige todos los chunks verificados | 6 |
| Un escenario que falla → no hay aprobación global | Función de decisión pura | 7 |
| Sin ejecuciones concurrentes | Lock exclusivo con PID; solo un lock muerto se retira, y solo al reanudar | 8 |
| Presupuesto no reiniciable | CPU acumulada persistida en cada chunk; `budget_exceeded` y `failed` son terminales | 8, 9 |
| Errores técnicos persistentes | `errors.jsonl` y estado `failed`; nunca se convierten en «sin efecto» | 10 |

**Resultado de las pruebas:** 36 de 36 pasan en 1,5 s (15 nuevas), con semillas de desarrollo. ESLint sin avisos y `tsc`
limpio. En la prueba 4, los chunks de la corrida interrumpida son idénticos byte a byte a los de la corrida continua. Las
fases 1 y 2 del piloto dan la misma salida que antes del cambio.

**Lo que el código no puede garantizar:**
- Que nadie borre la carpeta de salida para empezar de nuevo. Al estar dentro del repo, queda a la vista en git.
- La CPU de una invocación que muere entre dos checkpoints: se pierde como máximo la de un chunk (250 historiales), y la
  invocación queda registrada como `killed`.
- Quién firma la autorización. Es un control de proceso, no criptográfico: liga la corrida a un hash y a un commit, no
  autentica a una persona.
- La versión de Node y de esbuild no entra en el `sourceHash`. El ensayo y el piloto usaron Node 22.19.0.

## 4. Recursos

| Medición (semillas de desarrollo) | Historiales | CPU | RSS máx. |
|---|---:|---:|---:|
| Ensayo completo del runner (`rehearsal`, 17 escenarios × 40) | 680 | 1,7 s | 91 MiB |
| Piloto, fase 3 | 2.000 | 3,8 s | 105 MiB |
| Piloto, fase 2 (referencia) | 12.000 | 20,9 s | 124 MiB |

- **Estimación para la corrida reservada:** 44.000 historiales × ~1,7–2,5 ms ≈ **75–110 s de CPU** y ~130 MiB, en un solo
  proceso.
- **Presupuesto fijado:** 600 s de CPU y 512 MiB, con margen de 5 a 8 veces.
- El ensayo dio `rejected`, como corresponde con 40 historiales por escenario. Valida la mecánica, no la calibración.

## 5. Revisión científica: supuestos no demostrados

**Tendencias dentro de ventanas de 28 días.**
- Medí S1: senos de período 20–60 días más caminatas aleatorias, independientes en ambas series.
- 1.000 historiales de desarrollo: **3,6 %** de falsos respaldos (cota sup. 4,9 %), con una fracción de p ≤ 0,10 de 12,2 %.
- Hay una inflación leve, dentro del margen que deja el alfa de 3,5 %. No justifica cambiar el método.
- Riesgo residual: tendencias más fuertes o sincronizadas con el calendario del bloque.

**Cambios de rutina no registrados.** Cubierto por N6, que es criterio de aceptación: 2,4 % en la fase 2 del piloto. Es el
escenario con menos margen en la fase 1 (hasta 4,8 % con alfa 4 %).

**Efectos de arrastre entre sesiones.** No se midió, y no es un problema de falsa alerta sino de interpretación:
- Si el resultado de una sesión influye en la exposición siguiente (entrené mal, entonces comí distinto), existe una
  asociación real entre días. El método la respaldaría correctamente como asociación.
- Lo que no puede hacer es darle dirección. El texto del producto debe seguir siendo «fue con», nunca «causa».
- Un efecto que tarda más de un día en aparecer queda diluido: baja la potencia, no sube el error.

**Registro previo a la sesión frente a sesgos anticipatorios.** Este es el hallazgo relevante de la revisión:
- Medí S2: la exposición falta según su valor **y** según el estado previo a la sesión (cómo llega la persona), no según
  el resultado.
- 1.000 historiales de desarrollo: **7,8 %** de falsos respaldos (cota sup. 9,6 %). La compuerta de ausencia selectiva
  frenó solo el 5,8 % de los casos.
- **La regla «capturado antes de la sesión» reduce el sesgo (13 % en N7) pero no lo elimina.** Si alguien deja de anotar
  justo los días en que durmió poco y además se siente mal, el registro previo también queda sesgado.
- No es un defecto del contraste: es el mismo límite de identificación que N7, y ningún cambio de método lo resuelve.
- **No propongo cambiar el método ni los criterios.** S2 queda en el protocolo como estrés fuera de dominio, para que la
  corrida reservada lo cuantifique con semillas independientes.
- **Corrección limitada, de producto y no de calibración:** priorizar exposiciones de captura automática o habitual
  (sueño medido por dispositivo, comidas que la persona registra todos los días), y decir en el texto que el respaldo
  supone que anotar no depende de cómo se sentía ese día.

**Otros límites, sin cambios:** los generadores son sintéticos; no modelan varias sesiones por día ni error de medición;
el generador de números tiene estado de 32 bits, suficiente para un historial pero no auditado como criptográfico.

## 6. Pasos para ejecutar (no autorizados todavía)

1. Fusionar este PR y correr `plan` en el checkout final, con el árbol limpio.
2. Dirección firma el manifiesto de autorización con esos tres valores.
3. `verify <autorización>`, luego `run <autorización>`, y por último `finalize`.
4. Una sola corrida. Sin ajustes posteriores; un cambio de método exige otro protocolo y otro namespace.
