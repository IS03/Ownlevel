# #367 — Configuración del ejercicio por sesión

## Problema

El comparador estricto (`insights-performance/1`) solo compara dos exposiciones del mismo ejercicio si las dos tienen modo, unidad, implemento **y configuración** históricos y conocidos (`contextIssue` y `sameContext` en `src/lib/progress/performance-insights/exposure.ts`).

- Modo e implemento ya se guardan por sesión: `weight_mode_snapshot` e `implement_snapshot` en `workout_session_exercises`.
- La configuración no se guardaba en ningún lado. El loader la pasaba siempre como `null` (`src/lib/mobile-api/performance-insights-server.ts`), así que todo el historial cae en el método parcial (`configuration_unknown`).

## Decisión de producto de esta tanda

- **Una variante conserva el UUID del ejercicio.** Cambiar de agarre, banco o posición no obliga a crear otro ejercicio. La configuración se registra en la sesión.
- **La captura es breve y opcional.** Entrenar nunca depende de ella.

## Modelo

Tabla `workout_session_exercise_configurations`, una fila por ejercicio de sesión:

| Estado | Fila | Qué significa |
| --- | --- | --- |
| Desconocida | Sin fila, o `kind` nulo | Nadie la registró, o se borró a propósito. Es el estado de todo el historial |
| Registrada | `kind = 'recorded'`, `label` | La persona la nombró para esta sesión |
| No aplica | `kind = 'not_applicable'` | La persona dijo que el ejercicio no tiene variantes que separar |

**Procedencia (`source`):**
- `entered`: la escribió o eligió para esta sesión.
- `repeated_previous`: eligió «Igual que la última vez». `repeated_from` apunta a esa fila anterior. El servidor comprueba que sea del mismo ejercicio, de una sesión completada que terminó antes de que esta empezara, y que tenga el mismo valor.

**Fase (`recorded_phase`), la pone el servidor según el estado de la sesión al escribir:**
- `during_session`: se registró con la sesión en curso.
- `after_session`: se registró o corrigió con la sesión ya completada.

Registrarla después no permite afirmar que se capturó durante el entrenamiento: la fase lo dice. Repetir el mismo valor conserva la fase original.

**Reglas:**
- No se rellena el historial y no se escribe «none» por lo desconocido.
- **El catálogo no es historia.** Cambiarlo mañana no toca una sesión anterior.
- **Repetir la última es una elección explícita, nunca automática.** La pantalla ofrece el valor anterior y la persona lo confirma. No se presenta como una observación nueva: queda su procedencia.
- La etiqueta se guarda normalizada: sin espacios de más, sin saltos de línea y hasta 80 caracteres. Para comparar se ignoran las mayúsculas.

## Por qué una tabla aparte

`workout_session_exercises.updated_at` es el token CAS del autosave de series, y su trigger lo mueve en cada `UPDATE`. Si la configuración viviera en esa fila, registrarla haría fallar por conflicto el próximo guardado de series. En su tabla:
- tiene su propia revisión;
- finalizar, corregir y descartar no la tocan;
- una sesión descartada conserva sus filas y no acepta escrituras nuevas.

## Escritura

`mutate_training_exercise_configuration_v1(session, input)` sigue el mismo patrón que las sensaciones:
- toma el bloqueo por usuario;
- pasa por el ledger de idempotencia, que repite la respuesta exacta ante la misma clave y el mismo cuerpo;
- exige la revisión esperada por ejercicio de sesión (CAS).

**Comportamiento:**
- **Mismo valor:** no mueve la revisión.
- **Borrar:** requiere `value: null` explícito. Omitir un campo es inválido, no «borrar».
- **Sesión completada:** acepta escrituras, como anotación de la persona. El recibo durable del finish no cambia.

## Insights

Desde ADOPT:
- `recorded` entra al comparador como `recorded:<etiqueta en minúsculas>`.
- `not_applicable` entra como `not_applicable`.
- Desconocida queda en `null`.

**Esto sale de reglas que ya existían:**
- Una exposición con configuración conocida pertenece solo al carril estricto (`knownConfigurationExposures` en `partial.ts`).
- Dos configuraciones conocidas distintas nunca se comparan.
- Dentro de una misma sesión, dos bloques del mismo ejercicio con configuraciones distintas dan `mixed_context`.

**Consecuencias:**
- La primera sesión registrada de cada variante no tiene referencia estricta.
- Esa exposición deja de contar en el carril parcial.
- El historial desconocido no se vuelve estricto: sigue en el parcial.

La tabla entra en la revisión de fuentes (#391) igual que una serie: a través de su ejercicio de sesión, y solo cuando la sesión está completada.
