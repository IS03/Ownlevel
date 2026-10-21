# Nutrición · Paso 1: Home del día (Mobile)

Hacelo de punta a punta sin pedir OK: planificás, implementás, validás, probás en el Simulator, hacés commit y push, y abrís un PR a `main` en `IS03/Ownlevel`, listo para revisión. El merge lo hago yo.

Leé primero:
- `AGENTS.md`;
- `docs/brand/ownlevel-marca/IDENTIDAD.md` (Vidrio, Gráficos, Movimiento, Tono);
- `bocetos/nutricion/PLAN.md` (esto es solo el paso 1).

Es M9: solo presentación. No cambies datos, escrituras ni contratos.

## Bocetos (`bocetos/nutricion/`)
- `01-E5-home-elegida.png`: la pantalla completa y el estilo. Es la referencia principal.
- `04-N8-anillos.png`, `05-N9-anillos-tocado.png`, `06-N10-anillos-pasado.png`: los anillos y sus estados.
- `07-N14-tu-dia.png`: el panel "Tu día".
- `02-N2-mes.png`: la hoja del mes.
- `03-N3-menu.png`: el menú `•••`.

Los bocetos usan Inter y Lucide; en iOS van la fuente del sistema y SF Symbols. Los números son de ejemplo.

## Qué construir (en `apps/mobile/src/nutrition/`, partiendo de `day-screen.tsx` y `day-content.tsx`)
1. **Encabezado:** "Hoy" o la fecha, con los botones de vidrio de calendario (abre N2) y `•••` (N3: Comidas guardadas, Alimentos, Reporte y Plan nutricional, a las pantallas que ya existen).
2. **Tira de la semana:** los 7 días con mini anillos dobles; tocar un día lo abre.
3. **Anillos dobles** (N8–N10):
   - afuera calorías, adentro proteína, con extremos redondeados;
   - cuando te pasás del objetivo, el anillo sigue girando y el excedente se dibuja más oscuro;
   - al costado, la leyenda con carbos y grasas;
   - tocar el resumen alterna entre "llevás" y "te falta", con los números animados; carbos y grasas quedan atenuados;
   - sin objetivo o sin dato, el anillo no se inventa (missing ≠ zero).
4. **"Agregar comida":** botón de vidrio a todo el ancho, justo debajo de los anillos. Por ahora abre el flujo de agregar que ya existe; el menú nuevo es el paso 3.
5. **"Tu día"** (N14), en un panel de Liquid Glass:
   - Gasto estimado (según tu plan) y Balance, con flecha neutra y sin verde ni rojo;
   - celdas de métricas con mini anillo; tocar una abre el editor de actividad actual (la hoja nueva es el paso 2);
   - "Detalle" abre el contexto del día actual.
   - Es una excepción a la regla de vidrio. Con Reducir transparencia, Android o iOS anterior a 26, va un fondo sólido de marca.
6. **Comidas agrupadas por momento**, planas sobre el fondo con separadores finos y sin tarjetas blancas. Tocar una comida abre el editor actual.
7. **Fondo:** el resplandor champagne del estilo E5. Claro y oscuro.

## Datos
- **Día:** usá `fetchMobileNutritionDay` y lo que ya trae (resumen, contexto, actividad, comidas).
- **Semana y mes:** usá una lectura que ya exista (por ejemplo, el reporte, si trae calorías, proteína y objetivo por día). Si ninguna alcanza, no inventes datos: dejá la tira y los anillos del mes sin dato y reportá **BLOQUEADO** en el PR, con el EXPAND de solo lectura que propongas. No lo implementes.

## Reglas
- Marca:
  - un solo acento (champagne);
  - sin colores de bueno o malo sobre la ingesta;
  - cifras tabulares;
  - voseo, sin exclamaciones;
  - SF Symbols.
- Vidrio solo en los botones y en el panel "Tu día".
- Movimiento con los tokens de marca. Con Reducir movimiento, fundidos.
- VoiceOver: los anillos se leen como texto ("1.087 de 2.100 kcal, 79,9 de 130 g de proteína").
- No cambies los editores existentes ni las escrituras: solo cómo se llega a ellos.

## Validación y entrega
- `npm run validate` en `apps/mobile`. Actualizá los tests de `day-screen` y agregá los de los anillos (normal, pasado, sin objetivo, alternar).
- QA en el Simulator (iPhone, iOS 26), en claro y oscuro: un día con comidas, un día vacío y un día pasado del objetivo.
- Rama `codex/m9-nutrition-home`.
- En el PR: qué cambió, qué quedó para los pasos siguientes y la evidencia de QA.
