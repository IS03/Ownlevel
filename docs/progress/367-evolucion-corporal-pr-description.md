# #367 — Fase 3: evolución semanal del peso corporal

Cuerpo muestra el peso semana a semana: medianas, pesajes con sus fechas, cambio entre semanas seguidas y lo que quedó afuera. **El análisis frente a la alimentación y la actividad de la semana anterior se preparó y se calibró, pero no validó:** queda experimental y sin publicar. **Sin migración, sin API nueva y sin cambios de contrato.** «Consistente» sigue deshabilitado.

Método, preregistro y resultados: [367-evolucion-corporal-metodo.md](367-evolucion-corporal-metodo.md). El preregistro está en su propio commit (`baaa94d`), anterior al método y a la calibración.

## Qué cambió

- **Descripción** (`body-weekly/1`, `src/lib/progress/body-evolution/weekly.ts`, módulo puro compartido):
  - semanas de lunes a domingo en fechas lógicas de Córdoba, solo enteras dentro del período, sin la semana en curso;
  - peso válido según la regla canónica de Cuerpo (`isNewBodyWeight`): un 0 kg guardado se cuenta como inválido;
  - mediana con al menos 3 pesajes válidos, como regla de producto, con sus fechas;
  - cambio solo entre dos semanas seguidas con mediana. Una semana vacía o insuficiente corta la cadena y lo dice; nada se interpola.
- **Cuerpo en Mobile:** «Semana a semana» debajo del gráfico de peso.
  - Semanas más nuevas primero, con mediana, días de los pesajes y cambio con flecha y magnitud, sin color ni juicios.
  - Usa los pesos del período que la pantalla ya leyó. `parseProgressBody` exige claves exactas: agregar un campo a esa respuesta rompería clientes instalados.
- **Análisis experimental** (`insights-body-weekly/1`, `analysis.ts`):
  - una fila por cambio semanal W−1→W, fechada con el lunes de W;
  - cuatro exposiciones de W−1: calorías y proteína registradas por día con comidas (con al menos 4 días con comidas), entrenamientos terminados y series completadas;
  - la cobertura de comidas se informa. Un día sin comidas o con un valor desconocido nunca es cero, y 0 entrenamientos es un cero real;
  - la política de asociaciones se usa sin cambios;
  - ninguna vista lo prepara.
- **Calibración** (`calibration.ts`): simula filas fuente (pesos diarios, comidas, sesiones, ejercicios y series) y corre el mismo código, desde las medianas hasta las exposiciones.

## Evidencia

- **Calibración preregistrada:** 500 historiales por escenario, 24 meses, 12 actualizaciones, unos 62 cambios semanales al final.

  | Escenario | Algún exploratorio | Compuerta estricta | Wilson sup. 95 % |
  | --- | --- | --- | --- |
  | Independiente | 12,6 % | 0,6 % | **1,75 %** |
  | Dependencia temporal | 11,4 % | 0,2 % | **1,12 %** |
  | Tendencias espurias | 12,2 % | 0,6 % | 1,75 % |
  | Cambios de rutina | 10,0 % | 0,4 % | 1,45 % |
  | Ausencia selectiva (27 filas) | 0 % | 0 % | 0,76 % |
  | Efecto plantado | 52,4 % | 14,2 % | — |

- **No valida:** los nulos quedan por encima del objetivo propuesto del 1 %, que no es una tolerancia aprobada. La potencia frente al efecto plantado es baja: 47 % exploratorio en el candidato de calorías. No se ajustó ningún umbral.
- **Costo:** sin consultas nuevas. Un año de pesajes diarios (52 semanas) se describe en 0,3 a 0,7 ms, medido con otros procesos en paralelo.
- **Pruebas que pasan:**
  - descripción, análisis y calibración en Web: 9;
  - Mobile: 3 nuevas y las 83 de Cuerpo, Progreso e Inicio;
  - tipos y lint sin errores.

## Límites

- **Período:** la descripción usa el período elegido en Cuerpo, así que un período corto tiene pocas semanas enteras.
- **Superposición:** la mediana de W−1 y la exposición de W−1 comparten semana. El método no lo resuelve.
- **Sin producción:** no se midió con datos reales ni en producción.

## Pendientes

- **Mobile:** requiere build. La QA física está diferida, en la [lista única](367-qa-fisica.md).
- **Asociaciones:** necesitarían más semanas por cuenta o menos miradas, con un preregistro nuevo.

Previews bloqueadas para `codex/367-body-weekly` en `vercel.json`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
