# Nutrición · Paso 3: Agregar comida (Mobile + EXPAND chico)

Hacelo de punta a punta sin pedir OK: planificás, implementás, validás, probás en el Simulator, hacés commit y push, y abrís un PR a `main` en `IS03/Ownlevel`, listo para revisión. El merge lo hago yo.

Leé primero:
- `AGENTS.md`;
- `docs/brand/ownlevel-marca/IDENTIDAD.md` (Vidrio, Movimiento, Haptics, Tono);
- `bocetos/nutricion/PLAN.md` (esto es el paso 3);
- `bocetos/PENDIENTES.md` (EXPANDs de Nutrición).

No cambies la semántica de las escrituras existentes: idempotencia, posible duplicado, vista previa y confirmación. Reusá los controladores actuales (`quick-*`, `food-*`, `meal-*`, `saved-*`, `home-entry.ts`).

## Bocetos (`bocetos/nutricion/`)
- `15-G1-menu-agregar.png`: el menú de vidrio que abre "Agregar comida".
- `16-G2-rapido.png` y `18-G4-estados-mas.png`: Rápido y los estados del "+".
- `17-G3-alimento.png` y `20-A3-alimento-porcion.png`: Alimento por cantidad.
- `19-A2-ajustar-comida.png`: ajustar una comida guardada compuesta.
- `21-A4-a-mano.png`: carga a mano.
- `22-A5-agregado.png`: vuelta al día, con resaltado y Deshacer.
- `23-A6-duplicado.png`: alerta nativa de posible duplicado.

## Qué construir
1. **"Agregar comida"** (el botón de vidrio del home) abre un **menú nativo de Liquid Glass** (G1) con este orden: **A mano**, **Rápido**, **Alimento por cantidad**.
2. **Rápido** (G2 y G4), una hoja con buscador y dos secciones, "Para vos" (sugerencias por uso) y "Guardadas".
   - El "+" de cada fila agrega **en línea**: "+" → anillo girando → ✓, en el mismo tono champagne. La hoja queda abierta para agregar varias.
   - La fila agregada muestra "Agregado · Deshacer". Si falla, vuelve al "+" con el error.
   - Tocar la fila (no el "+") abre A2 para ajustar cantidades antes de agregar.
3. **A2 · Ajustar comida guardada:**
   - steppers por ingrediente y totales automáticos (sin botón "Actualizar vista previa");
   - "Así queda tu día", con los anillos del home en fantasma y lo nuevo encima;
   - el CTA dice "Agregar · 540 kcal".
4. **Alimento por cantidad** (G3 y A3):
   - lista con la porción de cada alimento y "Nuevo alimento";
   - al tocar un alimento: la cantidad en su unidad base, chips rápidos 1–4 porciones, la vista previa y "Así queda tu día".
5. **A mano** (A4):
   - kcal grandes y tres casillas de macros;
   - nombre opcional;
   - el toggle "Guardar en mis comidas";
   - sin fecha tipeada: va al día que se está viendo.
6. **Posible duplicado** (A6): una alerta nativa con las dos opciones que ya existen hoy.
7. **Al volver al día** (A5): la comida nueva se resalta un momento y aparece el aviso fino "Agregado · Deshacer". El aviso es el mismo componente que el de métricas del paso 2. Deshacer borra la comida con la eliminación que ya existe.

## Momento (EXPAND chico, aditivo)
Los bocetos A2–A4 tienen un chip de **momento** (Desayuno, Almuerzo, Merienda, Cena, Extra). Hoy las escrituras rápida y manual no lo reciben. La columna `meal_label` ya existe.
- Agregá `mealLabel` **opcional** a esas escrituras (servidor, contrato y parser de Mobile). Si no viene, se comporta exactamente igual que hoy, así que los clientes viejos no cambian.
- Por defecto, sugerí el momento según la hora. Se puede cambiar o dejar sin momento.
- La hora no la toques en este paso.
- Si el momento obliga a cambiar una RPC o la base:
  - la migración tiene que ser aditiva;
  - validala localmente con el runner de `scripts/testing`;
  - aplicala en el proyecto de Supabase "gym";
  - alineá el nombre del archivo con la versión aplicada;
  - documentala en el PR.
- Si no podés hacerlo así de seguro, **no** cambies el servidor: hacé todo lo demás sin el chip y reportalo en el PR.
- Tests del servidor:
  - con momento;
  - sin momento;
  - un momento inválido, que se rechaza;
  - ownership;
  - un replay con la misma clave de idempotencia.
- "Guardar en mis comidas" desde A4: dos escrituras en orden, cada una con su clave (primero registrar, después guardar). Si la segunda falla, la comida igual queda registrada y se avisa, sin reintento ciego.

## Reglas
- Marca:
  - un solo acento;
  - cifras tabulares;
  - voseo, sin exclamaciones;
  - sin colores de bueno o malo sobre la ingesta.
- Vidrio solo en controles (menú, botones, segmentados y "+").
- Sin dato ≠ 0 en los macros. Si un macro no se sabe, la casilla queda vacía y la suma lo marca como parcial, como hoy.
- Movimiento y haptics con los tokens de marca. Con Reducir movimiento, fundidos.
- Las hojas siguen el patrón de la hoja de métricas: el fondo oscuro aparece con un fundido y solo la hoja sube.

## Validación y entrega
- `npm run validate` en `apps/mobile`. En la raíz: `tsc` y los tests de `src/lib/mobile-api`.
- Tests de Mobile:
  - "+" en línea (éxito, falla y Deshacer);
  - ajuste con steppers;
  - porción con chips;
  - a mano con y sin guardar;
  - duplicado;
  - momento por defecto según la hora.
- QA en el Simulator, en claro y oscuro: agregá una comida por cada camino y **borralas después** para que el día quede como estaba.
- Rama `codex/m9-nutrition-add`.
- Actualizá `bocetos/PENDIENTES.md`: marcá el EXPAND del momento y anotá lo que quede afuera.
