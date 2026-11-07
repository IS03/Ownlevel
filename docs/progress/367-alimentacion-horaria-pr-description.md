# #367 — Fase 2: alimentación antes del inicio

Proteína y calorías registradas en las 3 h previas, y el tiempo desde la última comida registrada con hora explícita dentro de las 12 h previas. **Se publican como contexto de la sesión. Sus candidatos de asociación no validaron** con la calibración preregistrada y quedan fuera de las asociaciones públicas y de su preparación en las vistas. **Sin migración.** «Consistente» sigue deshabilitado.

Método, preregistro y resultados: [367-alimentacion-horaria-metodo.md](367-alimentacion-horaria-metodo.md). El preregistro está en su propio commit (`c68d6ba`), anterior a los candidatos y a la calibración.

## Qué cambió

- **Una sola agregación:** `mealWindow`, la de los carbohidratos, ahora recibe el nutriente. Proteína y calorías usan su misma ventana, su procedencia de la hora y su regla de qué comida queda adentro.
  - Las calorías son las registradas, nunca reconstruidas desde los macros.
  - Un cero registrado se conserva, y un macro desconocido impide el total.
  - La hora de registro no cuenta como explícita.
- **Última comida registrada con hora explícita** en [inicio − 12 h, inicio):
  - sin ninguna, queda censurada (`no_explicit_meal_in_12h`): nunca «12 h» ni ayuno;
  - una comida que no puede ubicar se señala, también del día anterior, porque la ventana cruza la medianoche. Es la única diferencia con la regla de los carbohidratos, que no se tocó para no mover sus resultados.
- **Contexto de la sesión** (`SessionFact.context.preStart`): opcional, así un cliente instalado lo ignora y un servidor anterior no lo manda. El contrato lo valida cuando viene.
- **Mobile:** tres filas separadas en el contexto de cada sesión, con su unidad y el motivo cuando falta el valor. Sin causalidad ni recomendaciones.
- **Candidatos:** `meal_window:proteinG:pre_3h`, `meal_window:calories:pre_3h` y `meal_timing:hours_since_last_explicit:pre_start`. Solo se construyen con `buildExposureTable(..., mealTiming = true)`, que ninguna vista llama.
- **Calibración:** `familyExtensionSteps`. Juzga los mismos historiales con la familia actual y con la ampliada; la familia base es exactamente la de `calibrationSteps`.

## Evidencia

- **Equivalencia con `main`:** sin `preStart`, **53 de 53** vistas idénticas en la huella de equivalencia. Los carbohidratos, las relaciones y las asociaciones no se movieron.
- **Candidatos que se evalúan de verdad,** sobre historias sintéticas:
  - las familias definidas van de 13 a 53, según las métricas de la cuenta;
  - con horas explícitas, los nuevos agregan 2 candidatos evaluables. El tiempo desde la última comida no varía con horarios fijos;
  - sin horas explícitas, no agregan ninguno.
- **Calibración preregistrada:**
  - **carril estricto:** pareado, 500 historiales por escenario, familias 13 → 16 y 23 → 26. La compuerta estricta no empeora en ningún caso. «Algún exploratorio» sube entre 4,2 y 9,2 puntos, por encima del límite de +2. En dependencia temporal con 26 candidatos, la cota de Wilson es 1,12 % (igual que la base);
  - **carril parcial:** 300 historiales. Dentro de los límites;
  - **decisión: no valida.** Los candidatos quedan afuera. No se ajustó ninguna ventana ni umbral, y el 1 % sigue siendo un objetivo propuesto, no una tolerancia aprobada;
  - no se repitieron las campañas de sensaciones.
- **Pruebas que pasan:**
  - Web: 411 de 412 con la campaña en paralelo. La que falló, `evidence.test.ts`, superó el tiempo bajo esa carga y pasa sola (11 de 11);
  - Mobile Insights: 59;
  - tipos y lint sin errores.

## Costo y límites

- **Sin consultas nuevas:** los valores salen de las comidas que la lectura ya trae, en el mismo recorrido de cada sesión. Sin lecturas por tarjeta, polling ni análisis al terminar.
- **Respuesta:** cada sesión del resumen lleva tres objetos chicos más.
- **Límites:**
  - la ventana de 3 h de los carbohidratos sigue sin señalar una comida sin hora del día anterior; se dejó así para no cambiar resultados publicados;
  - varias sesiones en un día siguen fuera de las asociaciones;
  - la latencia de producción no se midió.

## Pendientes

- **Mobile:** requiere build. La QA física está diferida, en la [lista única](367-qa-fisica.md).
- **Asociaciones de estos candidatos:** necesitan un método que no infle el exploratorio. Sería otro preregistro con su propia calibración.

Previews bloqueadas para `codex/367-meal-timing` en `vercel.json`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
