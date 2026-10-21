# Nutrición · Paso 2: Métricas del día (Mobile)

Hacelo de punta a punta sin pedir OK: planificás, implementás, validás, probás en el Simulator, hacés commit y push, y abrís un PR a `main` en `IS03/Ownlevel`, listo para revisión. El merge lo hago yo.

Leé primero:
- `AGENTS.md`;
- `docs/brand/ownlevel-marca/IDENTIDAD.md` (Vidrio, Movimiento, Haptics, Tono);
- `bocetos/nutricion/PLAN.md` (esto es solo el paso 2).

Es M9: solo presentación. Reusá la escritura de métricas que ya existe (`day-write-controller.ts`, `day-write-model.ts`, operación `metrics`, con su clave de idempotencia y su manejo de conflictos). No cambies contratos ni el servidor.

## Bocetos (`bocetos/nutricion/`)
- `10-M1-tocar-metrica.png`: tocar una celda de "Tu día".
- `11-M2-hoja-carga.png`: la hoja de carga.
- `12-M3-guardado.png`: guardado, con el aviso y Deshacer.

## Qué construir
1. **Entrada:** tocar una celda de métrica en el panel "Tu día" (`day-panel.tsx`) abre la hoja nueva de **esa** métrica. Hoy abre el editor de actividad completo. El editor completo sigue accesible desde "Detalle".
2. **Hoja de carga** (M2), una hoja corta:
   - X (cerrar sin guardar) y ✓ (guardar, champagne);
   - título con el nombre de la métrica y debajo "Lunes 12 · llevás 0,5 L de 2 L". Si no hay valor: "sin dato hoy". Si no hay objetivo, sin "de …";
   - segmentado nativo de Liquid Glass "Sumar a hoy | Reemplazar" (como `exercise-segmented`). Si hoy no hay valor, arranca en Reemplazar y "Sumar" no aparece;
   - un número grande con su unidad y la vista previa "Quedaría en 0,75 L";
   - la entrada se adapta al tipo de valor (`valueType`):
     - `decimal`: teclado decimal, con coma;
     - `integer`: teclado numérico;
     - `duration`: ruedas nativas de horas y minutos;
   - "Quitar el valor de hoy" abajo, en texto neutro: deja el día **sin dato** (`null`, nunca 0). Solo aparece si hay valor;
   - ✓ queda deshabilitado si el número es inválido o si no cambió nada.
3. **Guardado** (M3): al confirmar el servidor, la hoja se cierra, la celda se actualiza con una animación corta y aparece un aviso fino ("Agua: 0,75 L · Deshacer").
   - Deshacer vuelve al valor anterior, que puede ser `null`, con una escritura nueva.
   - Haptic de éxito según la tabla de la marca.
   - Si falla o el resultado es ambiguo: la hoja **no** se cierra, se muestra el error actual y se conserva la misma clave para el reintento (como hoy).
4. **Fechas:** respetá las reglas actuales de `canWriteDay('metrics', …)`, que no permiten fechas futuras y dejan las métricas archivadas solo para días pasados con valor. Si no se puede escribir, la celda no abre la hoja.

## Reglas
- "Sumar" calcula sobre el valor confirmado del servidor. Si mientras tanto llega un valor distinto, mostrás el conflicto como hoy; nunca sumás sobre un dato viejo en silencio.
- Marca:
  - un solo acento;
  - cifras tabulares;
  - voseo, sin exclamaciones;
  - vidrio solo en controles (botones y segmentado);
  - Reducir movimiento: fundidos.
- VoiceOver: la hoja anuncia el valor actual, el modo, la vista previa y el resultado del guardado.

## Validación y entrega
- `npm run validate` en `apps/mobile`. Tests de:
  - sumar;
  - reemplazar;
  - quitar (que manda `null`, no 0);
  - duración;
  - ✓ deshabilitado;
  - Deshacer a `null` y a un valor;
  - falla que mantiene la hoja y la clave.
- QA en el Simulator, en claro y oscuro, con agua (decimal), pasos (entero) y sueño (duración). Después de probar, dejá los valores como estaban.
- Rama `codex/m9-nutrition-metrics`.
- En el PR: qué cambió y la evidencia de QA.
