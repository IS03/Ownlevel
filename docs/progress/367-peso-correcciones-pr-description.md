# #367 — Correcciones de peso en Cuerpo: 0 kg e historial completo

Corrige dos fallos confirmados en el dominio de peso corporal, que comparten Web y Mobile. Rama separada de #404, que queda intacto. **Sin migración ni cambio de contrato de Mobile.**

## 1. Los pesos de 0 kg contaban como mediciones

**Qué pasaba**
- `day_logs.weight_kg` admite 0 (`check >= 0`).
- `parseOptionalWeight` de Web y el formulario de Mobile (`allowZero: true`) aceptaban 0 kg.
- El informe de Cuerpo (`bodyMetricObservations`, `weightMetricSamples`) solo pedía que fuera un número finito. Así, 0 kg entraba en:
  - el gráfico;
  - el primer y el último registro, y por lo tanto en el cambio;
  - el último peso;
  - la comparación de períodos;
  - las relaciones y las bandas de Etapas.
- Insights ya trataba 0 como inválido (`weightOfDay`).

**Qué cambia**
- **Una sola regla en el dominio:** `isValidBodyWeightKg`, mayor a 0 y hasta 999,99. Usan la misma regla:
  - las observaciones y las muestras de comparación y relaciones;
  - las etapas;
  - el peso de perfil como respaldo del último peso.
- **Los registros históricos se conservan:**
  - `excludedInvalidWeightCount` cuenta los inválidos del período.
  - Web lo dice con un aviso. El historial marca cada uno con «no cuenta: no es un peso» y deja corregirlo o borrarlo.
  - La métrica sigue disponible para llegar a ese registro.
- **Entradas nuevas:** se rechaza 0 kg en `parseOptionalWeight` (Web, en Cuerpo y Ajustes), en el contrato de escritura de Mobile (`isNewBodyWeight`) y en el formulario de Mobile.
- **Borrar o corregir un 0 kg sigue funcionando:**
  - el campo vacío borra;
  - la expectativa de CAS puede ser 0;
  - la operación `delete` no cambia;
  - leer un 0 kg sigue siendo válido.

## 2. listWeightHistory perdía los pesajes recientes después de 1000

**Qué pasaba:** pedía los pesajes de más viejo a más nuevo con `limit(1000)`. Con más de 1000, perdía los más recientes, y además:
- el último peso;
- el período actual;
- la comparación con el período anterior.

`listWeightHistory(1)` en Ajustes recibía el más viejo.

**Qué cambia**
- **`listAllWeightHistory`:** lee el historial completo en páginas por fecha (`log_date > última`), que es única por usuario y fecha. Así nunca saltea ni repite. Lo usan:
  - Cuerpo en Web;
  - el informe de Mobile;
  - Inicio, Etapas y Relaciones.
- **Corte:** termina con una página vacía, no con una corta. Un tope de filas del servidor más bajo que la página no la corta antes.
- **Sin truncar en silencio:** pasado el máximo (100 páginas), falla en lugar de devolver parte del historial.
- **No es solo invertir el orden,** que habría perdido las referencias viejas del período anterior y el primer registro de períodos largos.
- **`listWeightHistory(limit)`** ahora devuelve los `limit` más recientes, de más viejo a más nuevo, para quien pide una ventana.
- **Costo:** una consulta por cada 1000 pesajes más una vacía. Con menos de 1000, dos consultas en lugar de una.

## Compatibilidad

- **Mobile instalado:** la respuesta de `/progress/body` mantiene exactamente las mismas claves, porque el parser exige ese conjunto. Solo trae menos observaciones: sin los 0 kg.
- **Un pesaje en 0 kg sigue leyéndose** en `/body`. Una app vieja que intente guardar 0 kg recibe un error de validación, que es lo esperado.
- **#404:** su aviso de Cuerpo decía «hoy entra en el cambio» cuando el servidor todavía mandaba el 0 kg. Se ajusta en #404 para que sea correcto con y sin esta corrección.

## Validación

- **Nuevas:**
  - Lectura completa: más de 1000 pesajes (2501) incluidos los más recientes, sin repetir.
  - Tope del servidor más bajo que la página.
  - Historial vacío distinto de falla, y falla en lugar de truncar.
  - Ventana de los más recientes.
  - Informe del período más nuevo con más de 1000 pesajes, con ambos límites del período.
  - 0 kg fuera del gráfico, el cambio y la comparación, y contado.
  - Ausencia, cero y perfil en 0.
  - Rechazo de 0 en Web, en el contrato de Mobile y en el formulario de Mobile.
  - Corrección y borrado de un 0 kg.
  - `/progress/body` con 0 kg y las mismas claves.
- **Web y servidor:**
  - Afectadas (progreso, cuerpo, peso, Ajustes, Entrenar): 722 pruebas pasan, 4 omitidas por ser locales.
  - Tipos y lint de los archivos tocados, sin errores ni advertencias.
- **Mobile:**
  - Cuerpo y Progreso: 158 pruebas pasan.
  - Tipos y lint, sin errores ni advertencias.

## Pendiente

- **Base:** una restricción `weight_kg > 0` (`NOT VALID` y después validar) requiere migración y decidir qué hacer con los 0 existentes. No se hizo: la aplicación ya los rechaza y los excluye.
- **Medidas:** `listBodyMeasurements` tiene el mismo patrón: ascendente con `limit(1000)`. Con más de 1000 mediciones perdería las más recientes. Queda fuera de este cambio, que es de peso. La misma lectura por páginas se puede aplicar.
- **QA física:** en la [lista única](367-qa-fisica.md).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
