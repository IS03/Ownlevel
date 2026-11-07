# #367 — Simulador secuencial y validación reservada que no acredita el criterio

Continuación de #419 (`f32289a`). Se completa el simulador y se ejecuta **una única campaña reservada** del mismo método experimental, aislado de las vistas. Sin modificar parámetros tras mirar resultados ni publicar asociaciones.

## Resultado

- 9.000 historias sintéticas, 1.000 por nulo, con horizontes anidados de 24/36 meses.
- Cuatro nulos no acreditan Wilson 95 % con cota superior ≤ 1 %: autocorrelación (7/1.000 y 8/1.000; IC final **0,406–1,571 %**), cambios de rutina registrados/no registrados (4/1.000 cada uno; **0,156–1,024 %**) y horarios inciertos (5/1.000; **0,214–1,165 %**).
- Las estimaciones puntuales son inferiores al 1 %, pero esos intervalos lo incluyen: **evidencia insuficiente**, no aprobación ni prueba concluyente de exceso. Los demás nulos no compensan el incumplimiento.
- **Potencia no ejecutada**, por la parada preregistrada. Línea detenida, sin recalibrar, reintentar o inventar otro método.
- El 1 % sigue siendo objetivo propuesto, no tolerancia aprobada. «Consistente» permanece deshabilitado.

[Resultados completos](367-sensaciones-secuencial-resultados.md) · [JSON/manifiesto](367-sensaciones-secuencial-resultados.json).

## Protocolo previo y cambios

El protocolo, código y pruebas se commitearon/pushearon **antes** de la corrida en `627861aa32c2d530c07753357e4381dbe13f2a80`: [protocolo](367-sensaciones-secuencial-protocolo.md), [configuración](367-sensaciones-secuencial-protocolo.json).

- Comidas desde filas fuente: hora explícita, procedencias inciertas, medianoche, nutrientes faltantes y recepción sintética separada de la hora declarada. Sueño declarado presente y excluido.
- Prefijo disponible reconstruido en cada mirada; pruebas de invariancia frente al futuro en las 12 fechas y equivalencia con #419.
- Ambigüedades resueltas antes de correr: aniversarios incluidos (8/12 fechas), 0–3 aciertos a n=1.000, horizontes anidados, cuatro escenarios de potencia, semilla nueva y costo.
- Workers, cesión del hilo y checkpoints exclusivos con checksum. Una historia completada no se duplica al reanudar; una incompleta se recalcula idéntica. Sin overrides reservados de tamaño, semilla o permutaciones.
- `feeling-sequential.ts`, estratos, compuertas, α y presupuestos intactos. Sin cambios en consumidores ni contratos publicados.

## Validación y costo

- **25 pruebas dirigidas aprobadas:** 7 nuevas de simulación, 4 de recibos/agregación y 14 vigentes secuenciales/estratificadas. Dos mediciones opcionales de viabilidad omitidas, sin repetir sus campañas.
- Typecheck de raíz y ESLint dirigido: aprobados.
- Campaña: **10,95 min de pared; 89,78 min CPU; 959,09 MiB RSS muestreada**, Windows/Node 22.18.0, 8 workers.
- 215.998 evaluaciones de un resultado en una mirada y **6.867.481 permutaciones**; presupuestos completos, una invocación, 9.000 checkpoints y ninguna reanudación.
- Horarios inciertos: cobertura de carbohidratos/pre_3h de **19,50 %** de días elegibles; 78,421 pares/historia y 44,749 conservados en estratos. Ausencia no se convierte en cero.

## Límites

PR borrador, sin merge ni auto-merge. Previews bloqueadas para `codex/367-feeling-sequential-validation` en `vercel.json`. Sin migraciones, producción, datos personales, builds Mobile ni QA física. Sin pedir o leer tokens de autenticación. Tampoco se habilitarían asociaciones públicas si el criterio se hubiera cumplido.

La simulación append-only y el ámbito publicado de ventanas no acreditan todos los problemas retrospectivos. Checkpoints locales en `tmp/insights-sequential-reserved-v1`; resumen sintético y hashes publicados en el JSON.

Refs #367. Continúa #419.
