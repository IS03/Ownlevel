# Inicio (Mobile): "Esta semana" y "Métricas"

Lee primero AGENTS.md (sección "Identidad de marca"), docs/brand/ownlevel-marca/IDENTIDAD.md (Gráficos, Estados vacíos, Tono), tema/tokens.ts y docs/mobile/m9-brand-polish-plan.md (§9b, §9c, §10, §11). Esto es M9.3 · Home: es una pasada visual. Sin backend nuevo: se usan lecturas que ya existen.

## Bocetos (fuente visual)

Carpeta: `bocetos/inicio/` (PNG exportados de Pencil; el `.pen` está en `bocetos/bocetos.entrenar.pen`, encriptado). Cada lámina tiene arriba una nota que explica la intención. Los bocetos usan Inter y Lucide: en iOS va la fuente del sistema y SF Symbols. Los números son de ejemplo.

- 01-semana-nutricion.png
- 02-semana-habitos.png
- 03-metricas-deslizables.png

## Archivos de partida

- `apps/mobile/src/home/home-week.tsx`: páginas de "Esta semana". Ya existe `weekCalories()`, que hoy no se usa.
- `home-carousel.tsx`: alto fijo de 176, con scroll vertical dentro de cada página.
- `home-page-control(.ios).tsx`
- `home-register.tsx`: fila de Métricas, con "Más" fijo afuera del deslizable.
- `home-screen.tsx`, `home-data.ts` y `home-resource.ts`
- `apps/mobile/src/api/nutrition-report.ts` y `apps/mobile/src/api/progress.ts` (resumen con `metrics.items`: `ProgressMetricHabit`)

## Qué hay que construir

### 1. "Esta semana": 3 páginas que entran enteras
- **Página 1 · Entrenos: no se toca.** Queda exactamente como está hoy: número grande, detalle y cápsulas en acento con las letras de los días. La primera vez sigue mostrando el ejemplo con la etiqueta EJEMPLO.
- **Página 2 · Nutrición (lámina 01)**, reemplaza la lista de promedios:
  - Mismo estilo que Entrenos: **sin tarjeta**, directo sobre el fondo.
  - Arriba, "1.840" grande con "kcal promedio" y, a la derecha, "5 de 7 días" (días con datos). Mismo criterio de promedio que hoy: días terminados con datos.
  - **7 barras de calorías por día** (L a D), **desde 0**, en champagne, con el **objetivo como línea** (el promedio del objetivo si varía por día, o uno por día si queda claro; justificá tu elección).
    - **Día sin datos = carril vacío con borde, nunca una barra de 0.**
    - Días por venir: carril gris muy claro.
    - Hoy, si todavía no terminó, se distingue igual que en el promedio (no cuenta como día terminado).
    - Usá `weekCalories()`.
  - Abajo, en una línea: "Proteína 118 g · Carbos 205 g · Grasas 61 g" (promedios, cifras tabulares; sin dato = "—").
  - Tocar la página abre el reporte de la semana, como hoy.
  - Estados: cargando (esqueleto del mismo alto), no disponible ("No pudimos cargar Nutrición de esta semana.") y lectura vieja.
- **Página 3 · Hábitos (lámina 02, nueva)**, reemplaza "Por día", que se elimina:
  - Las métricas **activas** del usuario para la semana actual: ícono (los mismos del registro), nombre, "Promedio · 5 de 7 días" y el promedio con su unidad y formato (entero, decimal o duración), con cifras tabulares.
  - **Flecha neutra** (↗ o ↘, en gris, nunca verde o rojo) solo si la comparación con la semana anterior es comparable y subió o bajó. Si es estable o no comparable, sin flecha.
  - Hasta 3 filas. Si hay más, una última línea "y N más" que lleva a Métricas.
  - **Sin datos:** "—" y "0 de 7 días", nunca 0.
  - **Sin métricas activas:** el estado vacío de la marca (útil y neutro) con un acceso a Métricas.
  - **Datos:** el resumen de Progreso ya trae `metrics.items` (promedio, cobertura y comparación). Verificá que haya un preset o rango que coincida exactamente con la semana de Inicio (lunes a domingo, la misma `weekStart`). Si no lo hay, marcá BLOCKED y proponé el EXPAND mínimo. **No** calcules promedios en el cliente con datos parciales.
  - Tocar una fila abre esa métrica en Progreso.
- **Carrusel:**
  - **Sin scroll vertical dentro de las páginas.** Las tres entran en su alto fijo. Con letra grande (Dynamic Type), el alto puede crecer de forma acotada, igual para las tres, sin cortar contenido; si hace falta, reducí filas, por ejemplo menos métricas en Hábitos.
  - **Se mantienen los puntitos nativos de abajo** (`HomePageControl`), con sus etiquetas de accesibilidad "Entrenos", "Nutrición" y "Hábitos".
- Se elimina la página "Por día" y su código si queda sin uso. Tocar un día en la tira de Entrenos sigue abriendo ese día, con la ruta que corresponda según el rediseño del Historial.

### 2. Métricas: toda la fila deslizable (lámina 03)
- **Una sola fila horizontal que se desliza entera, con "Más" como último círculo**, dentro del mismo deslizable. Deja de estar fijo a la derecha.
- **Ancho fijo por círculo** (alrededor de 80 pt; con letra grande más ancho, como hoy), en vez de repartir el ancho de la pantalla. Así el siguiente siempre se asoma cortado en el borde cuando hay más de los que entran.
- El deslizable llega hasta el borde derecho de la pantalla. El margen izquierdo es el de la pantalla.
- Se mantiene todo lo demás:
  - vidrio solo con Liquid Glass disponible y sin "Reducir transparencia";
  - check y valor si se cargó hoy, "Cargar" si no, y "—" si la lectura de hoy no está confirmada;
  - orden del usuario;
  - accesibilidad.
- Cuidá que el vidrio de los círculos no se recorte arriba o abajo dentro del deslizable (el comentario actual de `styles.row` explica por qué).

## Reglas
- Antes de implementar, presentá el plan con alcance, riesgos y archivos, y esperá mi OK.
- Datos fieles: missing ≠ zero, empty ≠ unavailable, barras desde 0, sin barras fantasma ni interpolación, flechas sin color.
- Marca: un solo acento (barra de calorías champagne; nada de verde o rojo); vidrio solo en los controles que ya lo usan; cifras tabulares; escala tipográfica y medidas de la marca; voseo; sin exclamaciones en avisos.
- Respetar "Reducir movimiento" y "Reducir transparencia", y probar en claro y oscuro, con letra normal y grande. QA en Simulator/iPhone con semana vacía, semana parcial y semana completa, y con 0, 2 y 6 métricas activas.
- Tests: actualizar `home-week`, `home-carousel`, `home-register` y `home-screen`, y sumar: barra de día sin datos ≠ 0, Hábitos sin datos y sin métricas, flecha solo si es comparable, "Más" dentro del deslizable y páginas sin scroll interno.
- Validar con `npm run validate` en apps/mobile.
- No commitear, pushear ni abrir PR hasta que lo pida.
