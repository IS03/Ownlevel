# M9 — UX/UI Polish + Release · Plan de marca

Roadmap compartido para Claude Code, Codex, ChatGPT y Nacho.
Estado: **M0–M8 cerrados. M9 en curso.** El relevamiento original precede los cambios; los resultados y excepciones autorizadas se registran en §9.
Relevamiento: 2026-10-05 (main en `ce0ceed`). Contexto canónico de marca preparado en el PR "Prepare canonical brand context for M9".

Reglas permanentes de marca para agentes: `AGENTS.md` y `CLAUDE.md` → "Identidad de marca".
Fuente de verdad de la identidad: `docs/brand/ownlevel-marca/` (`IDENTIDAD.md` manda en el detalle).

---

## 1. Principios de M9

- M9 es pulido visual/UX y release. **No cambia** semántica de datos, analytics, contratos de API, write paths, CAS/idempotencia ni invariantes (`missing != zero`, `empty != unavailable`).
- Cimientos primero (tokens → tema → componentes base), pantallas después. Nunca "aplicar la marca a toda la app" en un PR.
- Paridad de producto, no de código: Mobile y Web comparten marca y tokens, no markup.
- Si la identidad choca con un invariante de producto o con la plataforma, se documenta en §5 y decide Nacho. No se fuerza ninguno de los dos lados.
- Cada PR de M9 es chico, tiene QA visual propio (Simulator/iPhone o navegador) y no mezcla dominios.

## 2. Fuente de la identidad (estado real)

Revisado completo: `IDENTIDAD.md`, `LEEME.md`, `tema/tokens.ts`, `tema/theme.ts`, `tema/haptics.ts`, `tema/theme.css`, y los assets de `logo/`, `app-icon/` (iOS, Icon Composer, Android), `web/` y `splash/` (SVG + PNG).

Estado del paquete en el repo (resuelto en el PR de preparación):
- Ubicación canónica: `docs/brand/ownlevel-marca/` (60 archivos, verificados por hash). Las copias duplicadas (`ownlevel-marca/` en la raíz, `ownlevel-identidad.md`, `docs/ownlevel-identidad.md`) eran idénticas y se borraron.
- `docs/**` está excluido del `tsconfig.json` raíz y de ESLint: `tema/theme.ts` y `tema/haptics.ts` importan `react-native`/`expo-haptics` y no deben compilarse con la Web. Los archivos de marca no se modificaron.

Tokens runtime (M9.1A, hecho): `packages/brand/src/tokens.ts` re-exporta `tema/tokens.ts` sin copiar valores (ver §6.1). Pendiente (C16): `tema/theme.css` todavía repite los hex a mano; el adaptador CSS de Web se deriva de los tokens en M9.4.

## 3. Arquitectura actual (relevada)

| Área | Estado |
|---|---|
| Repo | Monorepo **sin workspaces**. Raíz = Next.js 16 + React 19 + Tailwind v4 + shadcn. `apps/mobile` = Expo SDK 57 / RN 0.86 / React 19.2, `package-lock` propio. `mobile/` e `ios/` raíz = Capacitor legacy (no tocar). |
| Código compartido | Ya existe un precedente: Mobile importa `src/lib/mobile-api/*` por ruta relativa y Metro lo expone con `watchFolders`. |
| Mobile DS | `apps/mobile/src/design-system/` (`tokens.ts`, `theme.tsx`, `primitives.tsx`, `icons.tsx`). Paleta **violeta** (`primary` #7C3AED/#A78BFA). `OwnlevelThemeProvider` con preferencia persistida (M8, `ownlevel.theme.v1`). |
| Mobile íconos | `expo-symbols`: SF Symbols en iOS y Material Symbols en Android (`AppIcon` + `NativeTabs`). |
| Mobile tabs | `NativeTabs` (nativo; en iOS 26 el sistema ya dibuja vidrio): Inicio, Entrenar, Nutrición, Progreso. |
| Mobile haptics | `src/platform/haptics.ts`: `selection` / `success` / `warning` (28 llamadas). Sin preferencia de usuario. |
| Mobile assets | Un solo PNG (`assets/images/ownlevel-app-icon.png`, 512 px) usado como ícono, adaptive icon, favicon y splash. `app.json`: "OWNLEVEL Dev", `fit.ownlevel.app.dev`, scheme `ownlevel-dev`, iOS target 16.4. `app.config.js` (hotfix #173) valida el env público. |
| Web tema | `src/app/globals.css`: tokens shadcn en `oklch` violeta, `.dark` por clase, `ThemeProvider` propio (`appgym-theme` en localStorage). |
| Web fuentes | `next/font/google` Geist + Geist Mono. El stack ya empieza con `-apple-system`. |
| Web íconos | `lucide-react` ^1.8 (92 archivos). |
| Web assets | `src/app/favicon.ico`, `icon.png`, `apple-icon.png`; `public/brand/*.png` (lockups y app icons viejos); manifest en `src/lib/brand-metadata.ts` (`#0d0d12`, sin maskable). |
| Instrucciones de agentes | `AGENTS.md` versionado (instrucción compartida de Codex; Claude Code la importa). `CLAUDE.md` importa `@AGENTS.md` y repite solo la sección de marca, idéntica. No hay `CODEX.md`. |

## 4. Inventario de deuda visual

Conteos sobre código no-test al 2026-10-05. "Migrar" = deuda; "legítimo" = queda.

### 4.1 Tokens / colores

**Mobile**
- Paleta entera violeta en `design-system/tokens.ts` → migrar a la paleta grafito + champagne (`primary` 120 usos, `brandSubtle` 24, `brandSurface` 6).
- Tokens que la marca no tiene: `success` (7 usos), `warning` (19), `unavailable` (6). `danger` (42) ≈ `error` de marca, pero se usa también en estados de escritura → revisar (ver §5).
- Hex hardcodeados:
  - `training/routine-colors.ts` (16): paleta de 8 colores por rutina. Es **dato del usuario** (clave guardada) → decisión §5.
  - `#17131F`/`#FFFFFF` en `routines-screen.tsx:348` y `routine-editor-screen.tsx:139` (texto sobre color de rutina) → migrar.
  - `summary-slider.tsx` (2), `session-native-interactions.tsx` (1) → migrar.
  - Scrims `rgba(0,0,0,.35–.4)` (`session-note-sheet`, `completed-session-view`) y `shadowColor #000` → legítimos, pero conviene tokenizarlos.

**Web**
- `globals.css`: todo el set shadcn en `oklch` violeta (light/dark, sidebar, `--chart-1..5`, `--routine-*`, `--liquid-nav-*`) → migrar con un adaptador (no renombrar clases).
- Clases de paleta Tailwind en 22 archivos: `text-emerald` 30, `text-amber` 29, `bg-amber` 10, `bg-emerald` 9, bordes → "guardado"/"conectado"/avisos; migrar a tokens neutrales o de marca.
- Hex: `login-form.tsx` (colores del logo de Google) → **legítimo**. `brand-metadata.ts` y `layout.tsx` (`theme_color`, `themeColor` oklch) → migrar. `lib/phase2/routine-colors.ts` → misma decisión que Mobile.

### 4.2 Tipografía

- Mobile no setea `fontFamily` (0 usos): ya usa SF Pro en iOS y Roboto en Android. ✔
- Escala Mobile ≠ escala de marca:
  - `body` 16/400 vs Body 17/400.
  - `heading` 24 vs Title 1 28 / Title 2 22.
  - `caption` 13/500 vs Footnote 13/400 / Caption 12/500.
  - `label` 15/600 vs Subheadline 15/400 / Headline 17/600.
  - `overline` (12/700, tracking 1.1, mayúsculas) no existe en la marca y tiene 17 usos.
- 40 `fontSize` literales y 16 `fontWeight` literales fuera del DS (más frecuentes: 16 ×9, 28 ×8, 18 ×6).
- Cifras tabulares: solo 2 archivos en Mobile (sesión activa) y 1 en Web. Todos los números relevantes (peso, kcal, reps, series, volumen, deltas, timers) lo necesitan.
- Web: Geist cargado vía `next/font` → la marca pide solo fuente del sistema.

### 4.3 Radios / espaciado / medidas

- Mobile `radius`: `lg` 18 en `Surface` (marca: tarjeta 20); botón `md` 12 (marca 14); `pill` 999 usado 38 veces (chips: marca 10; `full` sí existe para avatares/botones circulares).
- Literales `borderRadius`: 12 ×8, 8 ×6, 2 ×3, 4 ×2, 24 ×1 → revisar uno por uno (12 = inner/input es válido).
- `spacing.xxxl` = 48 (5 usos) no está en la escala; faltan 20 y 40. Relleno de tarjeta 16 (marca 18). Separación entre bloques de pantalla 24 (marca 12 dentro de bloques).
- Botón `minHeight` 44 (marca 50). Inputs 48 ✔. Zona táctil 44 ✔.
- Literales chicos de padding/margin/gap (2 ×21, 3 ×2, 46 ×1) → la mayoría son ajustes ópticos; revisar en contexto.

### 4.4 Íconos

- Mobile: `expo-symbols` (SF Symbols en iOS ✔; Material Symbols en Android ≠ Lucide de marca). El ícono "brand" es un SF Symbol (`figure.strengthtraining.traditional`) más el texto "OWNLEVEL" en el header de Home → reemplazar por el isotipo.
- Marcadores de texto como UI: `'✓ '` en botones de selección (`nutrition/config-editor.tsx`) → reemplazar por un control de selección.
- Web: `lucide-react` ✔ (el trazo por defecto es 2). Revisar tamaños 24/20/17.

### 4.5 Copy

- Mobile: el copy de recuperación es técnico. Sobre 734 strings, aparecen "intento" (35), "lectura" (20), "borrador" (20), "almacenamiento" (15) y "servidor" (4). Ejemplos: "Comprobar intento guardado", "Cerrar · conservar intento", "Falta actualizar la lectura". Hay que reescribirlo con tono compañero **sin ocultar el estado** (la recuperación explícita es un invariante).
- Mobile: queda "Plan V2 vigente" / "Configuración heredada" (vocabulario interno) en el editor de configuración.
- No se encontraron frases de culpa o presión ni formas de "tú". ✔ No hay exclamaciones en la UI hoy ✔ (la marca las permite solo en logros).
- Web: poco copy técnico (3 "lectura", 2 "borrador"). Revisar tono general en M9.4.

### 4.6 Estados vacíos / carga / errores

- Mobile: `EmptyState` 21, `UnavailableState` 46, `InlineUnavailable` 65, `LoadingState` 24, `SkeletonBlock` 78. Hoy son solo texto. La marca (82 B) pide una vista previa con datos de ejemplo grises y la etiqueta **EJEMPLO**.
- Los estados "no disponible" ya distinguen correctamente `empty != unavailable`. Se conserva.

### 4.7 Gráficos

- Mobile `progress/value-bars.tsx`: las barras arrancan en el **mínimo del rango con un piso de 15 %**, no en 0. Exageran diferencias, y eso choca con "gráficos fieles a los datos". `missing` ya se muestra como hueco "Sin dato" ✔.
- Mobile `progress/training-trends-screen.tsx:27`: `improved` = `success` (verde) y `declined` = `warning` (ámbar) → viola "sin bien/mal por color; flecha".
- Cobertura baja en ámbar (`overview-screen.tsx:72,79`, `metrics-trends-screen.tsx:23`).
- Falta "período anterior en gris", el rótulo directo al final de la línea y la escala de intensidad de 5 pasos en calendarios.
- Web: gráficos SVG propios (`progress/comparison-evolution`, `training/*`, `body/body-progress-chart`, `nutrition/nutrition-report-charts`, `steps`, `daily-metrics`) con `--chart-1..5` violeta. Auditar el baseline en 0 y el uso de color en el PR de gráficos web.

## 5. Conflictos / decisiones necesarias

| # | Identidad dice | Implementación actual | Recomendación |
|---|---|---|---|
| C1 | Barra de 4 pestañas: Inicio, **Rutinas**, Entrenar, Progreso | Inicio, Entrenar, **Nutrición**, Progreso (M4 en paridad con Web) | **Mantener la IA actual.** Nutrición es un dominio central. Tomar la lista de la lámina como ilustrativa. Decide Nacho; si cambia, es un cambio de producto aparte de M9. |
| C2 | Barra flotante con vidrio a 16 de los bordes | `NativeTabs` nativo (vidrio y flotante del sistema en iOS 26; barra estándar en iOS < 26 y Android) | Mantener `NativeTabs`: cumple la intención en iOS 26 sin una barra custom. No reconstruirla. |
| C3 | Sin colores de "bien/mal"; solo `error` para el sistema | `success`/`warning` en tendencias, set completado (check verde), "guardado", "archivada", cobertura baja y estados inciertos | Tendencias: flecha + neutro. Set completado: check en acento o neutro. Cobertura y "archivada": texto secundario + ícono. Escritura incierta: neutro con ícono (no es una falla); `error` solo para falla o bloqueo. **No agregar** `success`/`warning` a la marca. |
| C4 | Un solo acento | Colores de rutina elegidos por el usuario, guardados como clave y compartidos con Web | **Decidido y autorizado el 2026-10-12:** conservar las 8 claves y remapear los tonos simultáneamente en Mobile y Web, sin migración de datos. Solo tira/punto de identidad y muestras del selector; nunca botones ni estados activos. Ampliar a 12 con `sand`, `stone`, `slate`, `graphite` mediante EXPAND → ADOPT. Parser Mobile tolerante antes de habilitar claves nuevas. Paleta y reglas: [IDENTIDAD.md](../brand/ownlevel-marca/IDENTIDAD.md#colores-de-rutina--c4). Cortes y estado: §9e. |
| C5 | Gráficos fieles; un solo dato en champagne y el período anterior en gris | `ValueBars` con baseline en el mínimo + 15 %; primario violeta | Barras desde 0, o puntos/líneas cuando el rango relativo importa. No cambia el contrato de datos (`missing` = hueco). |
| C6 | Íconos: Lucide en Android y Web | ✅ M9.1C: `AppIcon` usa SF Symbols en iOS (`icons.tsx`) y Lucide en Android (`icons.android.tsx`), 19/19 nombres mapeados, sin fallback. Excepción: los íconos de `NativeTabs` en Android siguen en Material (la API nativa de pestañas usa nombres de plataforma; navegación fuera de alcance) | Revisar los íconos de pestañas en Android junto con la navegación, si se decide. |
| C7 | Vidrio en controles (botones flotantes, temporizador, controles sobre gráficos) | No hay vidrio custom | `expo-glass-effect` solo en esos controles, con `isLiquidGlassAvailable()` y fallback sólido (`elevated`). Sin `expo-blur` en la primera pasada (costo/rendimiento en Android). |
| C8 | Hero con degradado #DCCBA3 → #A8935F | Hero de Home sólido violeta (`brandSurface`) | Requiere `expo-linear-gradient` (no instalado, nativo). Instalarlo en el PR de fundaciones y rebuild del dev client. |
| C9 | Tema de la marca sigue al sistema (`useColorScheme`) | M8: preferencia persistida Sistema/Claro/Oscuro | Mantener el provider de M8; la marca solo aporta las paletas. No usar `tema/theme.ts` tal cual. |
| C10 | `theme.css` usa `data-theme` + `prefers-color-scheme` | Web usa la clase `.dark` (variante custom) y `ThemeProvider` propio | El adaptador web mapea las variables `--ol-*` bajo `:root` / `.dark` y respeta el provider actual. No introducir `data-theme` en paralelo. |
| C11 | `accent` = champagne | En shadcn, `--accent` = superficie de hover | Mapear acento de marca → `--primary`/`--ring`; `elevated` → `--accent`/`--secondary`/`--muted`. Exponer además las utilidades de marca (`bg-surface`, `text-muted`…) sin romper las clases shadcn existentes. |
| C12 | Vibración por evento (tabla de 6 eventos) y, textual: "La vibración se puede apagar desde los Ajustes de la app." | ✅ M9.1C: `triggerHaptic(event)` sobre `hapticsMap` + interruptor en Ajustes (`ownlevel.haptics.v1`, default ON). Conectados: `setComplete`, `workoutComplete`, `stepperChange` (slider de escala). Sin consumidor todavía: `restEnd`, `personalRecord`. Quitados los `success` de cancelar, descartar y corregir | Pendiente M9.2/M9.3: revisar los toques legacy (`haptics.selection`, deprecado: navegación, toggles, reordenar, tic de pestaña) contra la tabla de la marca; conectar `restEnd` cuando el timer de descanso detecte el fin. |
| C13 | Splash: isotipo sobre #09090B (#F3F1EC en claro) | Ícono de la app sobre #F8F7FB / #0D0B12 | Usar `splash-isotipo-*`. Decidir entre splash siempre oscuro (sugerencia de `LEEME`) o según el modo. |
| C14 | Ícono iOS 26 de vidrio armado en Icon Composer | PNG único de 512 px (16-bit) | Usar `icon-1024*.png` (claro, oscuro, teñido) ya. El `.icon` de Icon Composer es un paso manual de Nacho en Xcode 26; después `ios.icon` apunta a ese archivo. |
| C15 | Estados vacíos con vista previa EJEMPLO | Solo texto | Aplicar solo donde un gráfico o lista quedaría vacío (Progreso, Historial, Métricas), nunca en lugares que muestran datos reales, nunca en acento. |
| C16 | `tokens.ts` como "fuente única" dentro de `docs/` | Resuelto en M9.1A para TS: `packages/brand/src/tokens.ts` re-exporta el archivo de la marca (TS puro), sin copia. `theme.css` sigue duplicando hex | No editar los hex de `theme.css` a mano: el adaptador CSS de Web (M9.4) se deriva de los tokens. |
| C17 | Escala de espacios sin 48 | `spacing.xxxl = 48` (5 usos) | Pasar a 40 o a 32 + 12 según el contexto. Ajuste visual, sin decisión de producto. |
| C18 | Tipografía: estilos de iOS | `overline` en mayúsculas con tracking (17 usos) | Reemplazar por Footnote/Caption de marca. Si Nacho quiere conservar un rótulo de sección en mayúsculas, documentarlo en la identidad primero. |

## 6. Arquitectura propuesta

### 6.1 Tokens compartidos (una sola fuente) — implementado en M9.1A

```
docs/brand/ownlevel-marca/tema/tokens.ts  ← ÚNICO archivo con valores (paquete de marca, TS puro)
packages/brand/src/tokens.ts              ← entrada runtime: `export * from` ese archivo, sin copia
```

- Los valores no se copian: el archivo de la marca ya es TS puro (sin React Native ni CSS) e `IDENTIDAD.md` lo declara fuente única. El código de la app importa siempre `packages/brand`, nunca `docs/` directo.
- **Web**: alias `@brand/*` en `tsconfig.json` y en `vitest.config.mts` (`import { palette } from "@brand/tokens"`).
- **Mobile**: `src/design-system/brand.ts` (import relativo, como `src/lib/mobile-api`) + `watchFolders` de Metro (`packages/brand/src` y `docs/brand/ownlevel-marca/tema`). Se expone como `brandTokens` desde `@/design-system`. **Todavía no se aplica a la UI** (M9.1B).
- `docs/**` sigue excluido del build raíz y de ESLint. `tema/theme.ts` y `tema/haptics.ts` (APIs de RN) no se importan desde ningún lado: no entran a Next ni al bundle Mobile.
- Tests: `src/lib/brand-tokens.test.ts` (valores clave de `IDENTIDAD.md`, sin tokens success/warning) y `apps/mobile/src/design-system/brand.test.ts` (Mobile resuelve el mismo módulo).
- Diferido: derivar el CSS de Web de los tokens (M9.4). Mientras tanto no se editan los hex de `tema/theme.css` ni se crea otra copia.

### 6.2 Adaptadores

| Capa | Ubicación | Contenido |
|---|---|---|
| Mobile tema | `apps/mobile/src/design-system/tokens.ts` → consume `./brand` (`packages/brand`) | Mapea la marca a nombres semánticos del DS (`background`, `surface`, `elevated`, `text`, `textMuted`, `accent`, `accentSoft`, `onAccent`, `error`, `border`, hero, chart, intensity). Se borra la paleta violeta. El provider de M8 (preferencia + persistencia) queda igual. |
| Mobile tipografía | `design-system/tokens.ts` (`typography`) y `primitives.tsx` (`AppText`) | `typeScale` de marca + estilo `numeric` (`tabular-nums`); variante de `AppText` por estilo iOS. |
| Mobile haptics | `apps/mobile/src/platform/haptics.ts` | `haptic(event)` según `hapticsMap`; respeta el interruptor local que pide `IDENTIDAD.md` (`ownlevel.haptics.v1`); reemplaza `selection/success/warning`. |
| Mobile vidrio | `design-system/glass.tsx` | `GlassControl`: `GlassView` si `isLiquidGlassAvailable()`, si no fondo `elevated` sólido. |
| Web tema | `src/app/globals.css` | Variables `--ol-*` derivadas de los tokens (mecanismo a definir en M9.4, sin copiar hex a mano) + mapeo de variables shadcn (`--primary`, `--background`, `--card`, `--muted`, `--border`, `--destructive`, `--chart-*`) a `--ol-*` bajo `:root` / `.dark`. |
| Web fuentes | `src/app/layout.tsx` | Quitar Geist; stack del sistema de la marca. Mono solo si hace falta (1 uso de `font-mono`). |
| Web metadata | `src/lib/brand-metadata.ts`, `src/lib/brand.ts`, `layout.tsx` (`themeColor`) | Colores #09090B / #F3F1EC, íconos de marca, maskable. |

### 6.3 Destino de assets (propuesto; **no copiado todavía**)

| Asset | Origen (`docs/brand/ownlevel-marca/`) | Destino |
|---|---|---|
| Ícono iOS (claro / oscuro / teñido) | `app-icon/ios/icon-1024{,-dark,-tinted}.png` | `apps/mobile/assets/brand/app-icon/ios/` → `app.json` `ios.icon.{light,dark,tinted}` |
| Ícono iOS 26 (vidrio) | `app-icon/ios/icon-composer/*.svg` (capas) | Nacho arma `ownlevel.icon` en Icon Composer → `apps/mobile/assets/brand/app-icon/ios/ownlevel.icon` |
| Android adaptativo | `app-icon/android/adaptive-{foreground,monochrome}.png` | `apps/mobile/assets/brand/app-icon/android/` → `android.adaptiveIcon` (fondo #09090B) |
| Play Store | `app-icon/android/play-store-512.png` | Fuera del bundle (ficha de la tienda) |
| Splash | `splash/splash-isotipo-{oscuro,claro}.png` | `apps/mobile/assets/brand/splash/` → plugin `expo-splash-screen` |
| Logo en la app (Mobile) | `logo/png/isotipo-*.png` (o SVG si se suma `react-native-svg`) | `apps/mobile/assets/brand/logo/` |
| Favicon / ícono Web | `web/favicon.ico`, `web/favicon.svg` | `src/app/favicon.ico`, `src/app/icon.svg` (convención de metadata de Next; reemplaza `icon.png`) |
| Apple touch | `web/apple-touch-icon.png` (180) | `src/app/apple-icon.png` |
| Manifest | `web/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | `public/brand/icons/` → `brand-metadata.ts` (sumar `purpose: "maskable"`) |
| Logos Web | `logo/*.svg` | `public/brand/logo/` → `src/lib/brand.ts` |
| Assets viejos | `public/brand/ownlevel-*.png`, `apps/mobile/assets/images/ownlevel-app-icon.png`, carpeta legacy trackeada `Logos/Logos gym/*` | Borrar en un PR de limpieza **después** de verificar que nada los referencia |

## 7. Dependencias

| Paquete | Estado | Versión | Uso actual | ¿Hace falta? | Nota / conflicto |
|---|---|---|---|---|---|
| `expo-haptics` | Instalada (Mobile) | ~57.0.3 | `platform/haptics.ts`, 28 llamadas | Sí | Falta la API por evento y el interruptor que pide la identidad (C12). |
| `expo-symbols` | Instalada (Mobile) | ~57.0.3 | `AppIcon`, `NativeTabs` | Sí | En Android usa Material Symbols, no Lucide (C6). |
| `expo-linear-gradient` | **No instalada** | — | — | Solo para el hero | Nativa: requiere `npx expo install` y rebuild del dev client (C8). |
| `lucide-react-native` | **No instalada** | — | — | Solo si se elige la opción B de C6 | Requiere `react-native-svg` (tampoco instalada, nativa). |
| `lucide-react` | Instalada (Web) | ^1.8.0 | 92 archivos | Sí | Alineada con la marca. |
| `expo-glass-effect` | **Solo transitiva** (vía `expo-router`), no es dependencia directa | 57.0.3 | Indirecta (NativeTabs) | Solo para controles flotantes | `GlassView` funciona en **iOS 26+**; en iOS < 26 (target 16.4), Android y Web renderiza un `View` común → fallback obligatorio. Si se usa directo, agregarla con `npx expo install`. |
| `react-native-reanimated` | Instalada | 4.5.1 | Interacciones | Sí | Base para `motion.spring` y "Reducir movimiento". |
| `react-native-svg` | No instalada | — | — | Solo para logos SVG o Lucide | Alternativa sin dependencia: PNG del logo. |

**SF Pro:** en iOS, React Native sin `fontFamily` ya usa San Francisco (SF Pro Text/Display según tamaño). **No agregar archivos de fuente.** Android: Roboto por defecto ✔. Web: stack del sistema de `theme.css`; quitar Geist. No se incluyen binarios de fuentes en el repo ni en la documentación.

Todo agregado nativo (`expo-linear-gradient`, `expo-glass-effect` directo, `react-native-svg`) y todo cambio de ícono o splash **requiere un dev client nuevo**: Fast Refresh no alcanza. Agruparlos en un solo PR para hacer un único rebuild.

## 8. Roadmap

### M9.0 — Release gates técnicos (sin branding)

Resueltos: rotación de la secret de Supabase y guardrail (#173), QA físico de M7/M8, cierre de M3.3, ubicación canónica de la identidad, exclusión de `docs/**` del build raíz y versionado de `AGENTS.md`.

Pendiente:
1. **Baseline rojo de la raíz** (preexistente, ajeno a M9): 2 tests fallan (`daily-metrics/write-reliability`: nombre de migración desactualizado; `nutrition/pr73`: espera un writer directo eliminado) y hay errores de lint en archivos legacy (`mobile/` Capacitor, `scripts/testing/*.mjs`, `src/lib/mobile-api/daily-metrics*`) y en el worktree `.kilo/` que entra al lint. Arreglarlos o aislarlos en un PR chico para que M9 corra sobre CI verde.

### M9.1 — Brand Foundations

Base sin tocar pantallas:
- tokens compartidos;
- tema Mobile (light/dark de marca);
- tipografía y `numeric`;
- radios, espaciado y medidas;
- semántica de color (C3);
- íconos (decisión C6);
- haptics por evento + el interruptor en Ajustes que exige `IDENTIDAD.md`;
- logo;
- ícono de la app;
- splash;
- favicon, metadata y manifest.

Resultado: la app ya se ve con la paleta nueva por herencia del DS, aunque las pantallas todavía no estén pulidas.

### M9.2 — Base Components

Componentes base, con tests visuales/unitarios, sobre los que se apoya todo lo demás:
- `Button` (alto 50, radio 14, presionado al 95 %);
- `Input` (48/12);
- `Surface`/Card (20/18, sin vidrio);
- fila de lista (12);
- chips (34/10);
- controles de selección (reemplazan los `✓`);
- headers y headers de sheet/modal (28);
- feedback (error, incierto, confirmado, con el copy nuevo);
- `EmptyState` con vista previa EJEMPLO;
- skeleton/loading;
- primitivas de gráfico (línea/barras desde 0, período anterior gris, rótulo directo, intensidad de 5 pasos);
- `GlassControl`.

Incluye un **glosario de copy de recuperación**: términos fijos para incierto/confirmado/bloqueado/conflicto, en tono compañero, preservando la acción explícita.

### M9.3 — Screen Polish (Mobile)

Orden propuesto: por impacto × dependencia de los componentes de M9.2, y con riesgo creciente.
1. **Auth** (sign-in; primera impresión, poca lógica).
2. **Home** (hero con degradado, header con isotipo, accesos).
3. **Settings** (pantalla nueva de M8; valida el kit de filas y aloja el interruptor de vibración de la identidad).
4. **Progress** (gráficos: aplica C3/C5, tendencias con flecha).
5. **Body / Metrics** (badges de calidad, editores; copy de recuperación).
6. **Nutrition** (día, editores, config; es el volumen más grande de copy técnico).
7. **History** (calendario con escala de intensidad).
8. **Training** fuera de la sesión activa (landing, rutinas, editor, biblioteca, historial, corrección; decisión C4).
9. **Training: sesión activa y finish** (último por riesgo: drafts, autosave, CAS, timer; solo visual).

### M9.4 — Web Brand Alignment

- Adaptador CSS (C10/C11) y fuente del sistema.
- Íconos, favicon, manifest y metadata.
- Reemplazo de emerald/amber.
- Gráficos web (baseline en 0, paleta `chart`).
- Tono de copy.

Misma marca y tokens que Mobile, con patrones web propios: sin tab bar flotante, layouts de escritorio, foco de teclado. No clonar Mobile.

### M9.5 — Release

- Identidad de producción: nombre "OWNLEVEL", bundle ID/package y scheme de prod. Variantes por `EXPO_PUBLIC_APP_ENV` en `app.config.js`.
- Ícono y splash finales, versionado y build number.
- Callback de Auth de prod en el allowlist de Supabase.
- Build de producción.
- Accesibilidad: Dynamic Type, VoiceOver, contraste del champagne en claro, "Reducir movimiento".
- Gates de App Store:
  - **eliminación de cuenta dentro de la app** (Guideline 5.1.1(v); hoy no existe: gap de M8, necesita decisión de producto + backend);
  - URL de política de privacidad;
  - privacy manifest.
- QA de release.

## 9. Secuencia de PRs propuesta

| PR | Fase | Contenido | Rebuild nativo |
|---|---|---|---|
| 0 | M9.0 | Baseline verde de la raíz (2 tests + lint preexistente) | No |
| 1 | M9.1 | ✅ M9.1A: `packages/brand` (re-export de los tokens de la marca), alias Web, puente Mobile + Metro, tests | No |
| 2 | M9.1 | ✅ M9.1B: tema Mobile sobre `packages/brand` (paleta, tipografía, radios, espacios; alias deprecados `success`/`warning`/`unavailable`/`overline`). Pendiente para M9.2: `numeric` y consumidores de los alias | No |
| 3 | M9.1 | ✅ M9.1D: assets de marca instalados. Mobile: ícono iOS claro/oscuro/teñido, adaptativo Android (+ monocromo, fondo #09090B), splash por modo (isotipo, 96, #F3F1EC/#09090B), logos en `assets/brand/logo`. Web: `favicon.ico`, `icon.svg`, `apple-icon.png` (convención App Router), manifest 192/512/maskable, colores de marca. Legacy runtime borrado. Pendiente: `AppIcon name="brand"` → isotipo (M9.2/M9.3, Home), `.icon` de Icon Composer (M9.5), carpeta `Logos/` (limpieza aparte) | **Sí** (ícono y splash son nativos: prebuild + rebuild) |
| 4 | M9.1 | ✅ M9.1C: íconos por plataforma (SF Symbols / Lucide) + haptics por evento + interruptor en Ajustes | Android: sí (react-native-svg) |
| 5–7 | M9.2 | ✅ M9.2 (un PR integral): Button, TextField, Surface/InnerSurface, ListRow/ListGroup, Chip/ChipGroup/SegmentedControl, SectionHeader/ScreenHeader, SheetHeader/SheetSurface, InlineNotice, Empty/Unavailable/Loading/Skeleton, ExampleFrame, `ValueBars` fiel. Diferidos a M9.3: glosario de copy de recuperación, `GlassControl` (requiere `expo-glass-effect` directo), primitivas de línea/período anterior | No |
| 8–15 | M9.3 | Una pantalla o dominio por PR, en el orden de §8 | No |
| 16 | M9.4 | Web: adaptador CSS + fuente + metadata, manifest e íconos | No |
| 17 | M9.4 | Web: emerald/amber → tokens, gráficos, copy | No |
| 18 | M9.5 | Variantes de producción, accesibilidad, gates de tienda (eliminación de cuenta = milestone propio si requiere backend) | Sí |

## 9b. Resultado de M9.2 y pendientes por pantalla para M9.3

**Primitives canónicas** (`apps/mobile/src/design-system`): `AppText` (roles oficiales + `numeric`), `Heading`, `Button` (primary/secondary/quiet/destructive, loading, icon; 50/14; presión 95 % o fundido con Reducir movimiento), `TextField` (48/12 sobre `elevated`, label/hint/error/disabled/numeric/search/multiline), `Surface` (20/18), `InnerSurface` (12), `ListRow`/`ListGroup`, `Chip`/`ChipGroup`/`SegmentedControl`, `SectionHeader` (Title 2), `ScreenHeader` (Large Title), `SheetHeader`/`SheetSurface`/`SheetHandle` (28), `InlineNotice` (acciones del caller), `EmptyState` (+ `ExampleFrame` EJEMPLO), `UnavailableState`, `LoadingState`, `SkeletonBlock`, `ProgressBar`, `IconCircle`. `ValueBars` usa escala lineal desde 0 (0 sin barra, sin dato = hueco, negativos a la izquierda, sin magnitud mínima).

**Alias eliminados:** `success`, `warning`, `unavailable`, `overline`. **Siguen:** radios legacy `sm/md/lg/xl/pill` (≈90 usos; mismos valores que `input/inner/card/card/full`), nombres de rol `display/heading/label` (= largeTitle/title2/headline).

**Pendientes por pantalla (M9.3; presentar antes de implementar):**
- **Navegación:** con el tema forzado distinto del sistema, la barra nativa (vidrio iOS 26) sigue la apariencia del sistema y la pestaña activa pierde contraste. Íconos de pestañas Android en Material (C6).
- **Inicio:** ícono `brand` → isotipo; hero sin degradado (`expo-linear-gradient`); wordmark con estilo propio.
- **Entrenar:** colores de rutina (C4) y texto `#17131F`/`#FFFFFF` sobre ellos (`routines-screen`, `routine-editor-screen`); `summary-slider` y `session-native-interactions` con `#FFFFFF`/`#000`; encabezado de columna `✓` como glifo; botones de decisión (+ Peso / + Repeticiones) que son selección; cifras tabulares en series; inputs propios (`TargetInput`, celdas de serie, notas).
- **Nutrición:** pila de acciones quiet; cifras del resumen sin `numeric`; copy técnico de recuperación ("intento", "lectura", "almacenamiento"); inputs propios (quick, meal, food, saved, day-write, date-selector, reporte).
- **Progreso:** fila "Rendimiento de entrenamiento" se corta (label/valor); "mejoró" en champagne (debe ser flecha + neutro); cobertura baja con énfasis; período anterior en gris y rótulo directo en gráficos; cifras tabulares.
- **Historial:** rótulo "Training" en inglés; escala de intensidad de 5 pasos en el calendario.
- **Cuerpo / Métricas:** badges de calidad y mensajes de estado en texto neutro (antes ámbar); inputs ya en `TextField`.
- **Ajustes:** tarjeta de perfil e íconos de filas a decidir.
- **Restantes `TextInput` propios** (≈20 archivos) a migrar a `TextField` dentro de cada pantalla.

### 9c. Atmósfera de fondo (M9.3 Inicio V3) — a revisar al cierre de M9

Colores nuevos que **no están en la paleta de marca** y viven aparte en `apps/mobile/src/design-system/atmosphere.ts` (los roles del tema solo mapean valores de marca). El modo oscuro mantiene la paleta oscura de marca; solo se agregaron estos:

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `glow` | rgb(228,222,201) `#E4DEC9` | rgb(42,39,32) `#2A2720` | Centro del resplandor de fondo |
| `band` | rgb(228,222,201) `#E4DEC9` | rgb(31,29,24) `#1F1D18` | Franja de Nutrición en Inicio |
| `bandTextMuted` | `#5F5D54` | — (gris de marca) | Gris secundario dentro de la franja clara: el gris de marca da ≈3,9:1 sobre `#E4DEC9`; este ≈4,8:1. También "N días entrenados" de Entrenar, que cae sobre el resplandor |
| `accentStrong` | `#5E5129` | — (acento de marca) | Texto del botón de vidrio "Nueva sesión" (Entrenar): el acento de marca sobre el vidrio con tinte da ≈4:1; este ≈6:1 |

Dentro de la franja, pista y línea usan la escala de intensidad (claro `#CFC8B6`) o `elevated`/`border` (oscuro); barras y acento son los de marca.

**Para registrar en `IDENTIDAD.md` (decisión pendiente):**
- Degradados de fondo permitidos: un único resplandor radial fijo (elipse de radios 300 × 400, centro en 105 % / -4 %, stops 1 → 0,55 a 38 % → 0, mismo color con alpha 0, nunca `transparent`), detrás del contenido, estático, sin animación ni interacción.
- Franjas tonales: solo la de Nutrición en Inicio, a ancho completo, con fundido vertical de 48 en cada borde; nada se transparenta a través de ella.
- Dónde no van: sesión de entrenamiento activa (flujo de foco), sheets y modales, y por ahora bajo encabezados nativos opacos (cortarían el resplandor; extenderlo requiere encabezados transparentes, PR aparte junto con las ≈15 pantallas con fondo propio que todavía no usan `Screen`/`ScrollScreen`).
- Agregar los tokens de arriba a la paleta (`tema/tokens.ts`) y su equivalente CSS para Web (`radial-gradient(ellipse 300px 400px at 105% -4%, …)`).


### 9d. Entrenar (hub) — siguiente iteración

- **Día seleccionado (opción "a"):** en esta pasada el bloque de Entrenar muestra siempre hoy y tocar un día pasado abre `/history/day/[fecha]`. La siguiente iteración puede hacer que tocar un día lo seleccione y el bloque muestre ese día. El modelo ya está preparado: `dayBlock(date, sessions)` (`apps/mobile/src/training/training-hub-model.ts`) recibe la fecha, no "hoy" fijo. Falta definir cómo se marca el día seleccionado en la tira y cómo se ve un día pasado o futuro sin sesiones.
- **Calendario fijo:** la tira de la semana queda fija arriba y al tocarla se expande en el mismo vidrio al mes completo (ruedas nativas de mes y año al tocar el título). En iOS 26 es una vista SwiftUI (`@expo/ui`: `glassEffect`, `animation`, `Picker` en rueda) en `training-week-calendar.ios.tsx`; en Android, iOS anterior o "Reducir transparencia", la versión React Native (`training-week-calendar-rn.tsx`) sobre la superficie de marca, con flechas para cambiar de mes. `GlassSurface` (design system) sigue para el botón "Nueva sesión".
- **Nueva sesión (Inicio y Entrenar):** sheet nativa compartida (`use-new-session.tsx`): recomendada, "Elegir rutina" (push nativo con volver) y "Sesión libre"; la X es la del sistema. En iOS es SwiftUI (`BottomSheet` + `NavigationStack` + `Toolbar`); en Android, React Native. Elegir cierra la sheet y arranca directo, sin selector intermedio.
- **Arranque directo:** `use-session-starter.tsx` reemplaza a `StartWorkoutModal`. Usa el mismo flujo (`useWorkoutStart`: verificación de sesión en curso, clave de idempotencia, reintento explícito con la misma clave) y muestra solo "Iniciando…"; los casos que piden decisión son alertas nativas (sesión en curso → Continuar, no se pudo verificar → Reintentar, fallo ambiguo → Reintentar con la misma clave). El ▶ de cada rutina y "Iniciar entrenamiento" del editor piden confirmación antes (`start-confirm`: diálogo anclado de SwiftUI en iOS, alerta en Android). En iOS 26 el toque fuera del diálogo también llegaba a la pantalla de abajo; mientras está abierto la pantalla no toma toques (`start-confirm-lock.ts`).
- **Recomendación:** rutina más repetida en el mismo día de la semana de las últimas 12 semanas (días distintos, por `logDate`; mínimo 2; empate = la más reciente; solo rutinas activas). Si ya se hizo hoy se sigue mostrando, con "Ya la hiciste hoy". Se calcula en la app con 13 lecturas de día en paralelo (hoy y el mismo día de las 12 semanas anteriores) más una página de historial para "última vez"; se precarga 1 s después de abrir la pantalla y queda en memoria 5 min. Si falla un día no hay recomendación (nunca se adivina con datos parciales). Mejora posible: calcularla en el servidor (paso EXPAND, fuera de M9).
- **Calendario sin pie:** se quitaron "N días entrenados" e "Ir a hoy". El mes siempre ocupa 6 filas y las ruedas la misma altura, así abrir, cerrar, cambiar de mes o abrir las ruedas no cambia el alto de golpe. La altura del `Host` la decide React Native, no el contenido: con `matchContents` el `Host` llegaba un cuadro tarde y SwiftUI centraba el contenido (el vidrio saltaba al abrir o cerrar). El vidrio se mide con `onGeometryChange`; el `Host` crece antes de abrir y se achica después de la animación de cierre, y el contenedor SwiftUI (`minHeight: 0`) siempre ocupa el alto del `Host` con el vidrio arriba.
- **Sheet Nueva sesión ajustada:** la primera página mide su contenido y usa un detent de esa altura (sin media pantalla vacía); "Elegir rutina" abre grande.

### 9e. Biblioteca de rutinas · M9.3 Training fuera de sesión

Pedido explícito de producto y plan aprobado el 2026-10-12. Fuente visual: `bocetos/rutinas-biblioteca/01` a `10`; variante 2 de la lámina 03, filas ampliadas de la 10 y botón directo Ordenar en lugar del menú superior. No usar las variantes descartadas del `.pen`.

- **A · UI + compatibilidad de lectura (implementada y validada localmente; layout aprobado por el usuario el 2026-10-12):** lista nativa; swipe Archivar / confirmación Empezar con el flujo existente; aviso de archivado confirmado con Deshacer (4 s); menú contextual nativo sin vista previa de ejercicios ni Duplicar; ruta propia Archivadas; hoja Nueva rutina ajustada al contenido con TextField, vista previa y ocho colores con targets 48. Cambiar color abre el modal de identidad del editor con su CAS. Se elimina el acceso Mobile al plan inicial, conservando endpoint y Web. Ocho tonos remapeados simultáneamente; colores desconocidos no invalidan Home, Training, lista, detalle, ejercicios, sesión ni historial. El calendario conserva el día entrenado aun sin color reconocido; el editor impide borrar inadvertidamente una clave desconocida.
- **B · EXPAND (implementado, validado y aplicado a la base remota con autorización el 2026-10-12):** migraciones nuevas y tests SQL locales; RPC transaccional de duplicación con ledger, copia de plantilla y desplazamiento del orden; RPC de reordenar activas con validación exacta de IDs, versión de lista e idempotencia; lecturas atómicas de lista y versión; check/RPC/contratos/presets/CSS para cuatro claves nuevas. Identidad del bearer, ownership/RLS, bloqueo de Training y snapshots conservados. Aplicación remota autorizada y verificada el 2026-10-12.
- **C · Mobile ADOPT (implementado y validado; QA nativo del usuario pendiente):** Duplicar en el menú y la hoja compartida, Ordenar con arrastre y Listo, doce colores en dos filas de seis. Ordenar se incorpora en C para que su botón tenga una escritura real disponible. Sin nuevas dependencias nativas previstas.

La versión de lista evita pisar órdenes guardados entre dispositivos aunque la membresía siga igual. Los triggers deben observar también los writers Web; los cambios de nombre importan mientras haya empates de `routine_order`. El EXPAND debe respetar el límite actual 1–1000 y no alterar silenciosamente su semántica. A distribuido antes de permitir las claves nuevas; B desplegado antes de C.

QA de A: claro/oscuro, Reducir movimiento, Dynamic Type, swipe parcial/completo y long press, hoja con teclado, archivo/deshacer/restauración, lecturas fallidas y dobles envíos. Validación: `npm run validate` Mobile y checks correspondientes de raíz. Sin commit/push/PR durante QA.

Validación local de A (2026-10-12): `npm run validate` Mobile completo, 109 suites / 845 tests; exportación de bundles iOS y Android; typecheck raíz y lint del test Web modificado. Tests raíz: 1476 pasan y siguen los dos fallos preexistentes documentados en M9.0 (`daily-metrics/write-reliability`, `nutrition/pr73`). Lint raíz: 2 errores y 13 warnings preexistentes, fuera de los archivos modificados. El QA nativo no se considera realizado por la exportación de JavaScript.

Contrato de B:

- `GET /api/mobile/v1/training/routines` conserva `routines` e `initialPlan` y agrega `listVersion: { status: "ok", data: número }`. Rutinas, conteos y versión se leen juntos; si falla esa lectura, ambos recursos quedan `unavailable`. La versión es un token de concurrencia, no un conteo: puede avanzar varias veces en una transacción. Los triggers incluyen inserts, deletes, nombre, estado y orden de Web; color, notas y plantilla no la avanzan por sí solos.
- `POST /api/mobile/v1/training/routines/{id}/duplicate`: `name`, `color` (o null), `idempotencyKey`, `expectedUpdatedAt`, `expectedTemplateVersion` del detalle. Respuesta 201 `{ routine }`. La copia conserva notas y todos los objetivos, referencias del catálogo y series con null/0; nuevos IDs de plantilla, sin `source_key`, sesiones ni snapshots. Siempre activa, inmediatamente después de la original en el orden global estable (también si la original está archivada). Se desplaza solo el sufijo necesario, sin modificar la original. Si no cabe en 1–1000, toda la operación se rechaza y revierte.
- `PUT /api/mobile/v1/training/routines/order`: `routineIds` en el orden deseado (solo activas), `expectedListVersion`, `idempotencyKey`. Respuesta 200 `{ routineIds, listVersion }`. Membresía exacta y versión; conflicto 409 `ROUTINE_LIST_CHANGED` requiere volver a leer. Mismo orden confirmado no reescribe filas. Reintento con idéntica clave/payload devuelve el resultado guardado; otros datos dan `IDEMPOTENCY_KEY_REUSED`.
- RPC públicas de duplicar/reordenar `SECURITY INVOKER`; núcleos privados `SECURITY DEFINER`, SQL fijo, `search_path` vacío e identidad desde `auth.uid()` con ownership en cada escritura. El núcleo privado completo es necesario para el ledger cerrado: no se expone un finalizador genérico capaz de fabricar respuestas. No se cambian RLS ni grants de tablas de producto. Estado de versión privado con RLS y sin acceso directo del cliente. Sin service-role en el camino HTTP.
- Migración: `20261012230412_mobile_routine_library_expand.sql`. Amplía check y validaciones instaladas de crear/identidad/importar, conserva reparaciones previas y corrige digest/bloqueo antes del ledger en crear rutinas. Cuatro claves nuevas, presets y CSS en Web, tokens compartidos; checks de selector Web con tokens y contraste ≥3:1 en ambos temas. Mobile continúa con ocho opciones hasta C y tolera claves nuevas como color ausente.

Validación local de B (2026-10-12): `npm run validate` Mobile, 109 suites / 845 tests; typecheck raíz y lint de archivos modificados. Tests raíz: 1510 pasan; siguen los dos fallos preexistentes de `daily-metrics/write-reliability` y `nutrition/pr73`. Lint raíz: mismos 2 errores y 13 warnings preexistentes. PostgreSQL 17 desechable: migración real reaplicada, tests `supabase/tests/m9_routine_library.sql` y carreras reales entre dos conexiones (duplicación concurrente, reordenar vs reordenar, Web archivar/crear/renombrar vs Mobile, lectura coherente). Runner: `OWNLEVEL_TEST_MODULES=/ruta/externa/node_modules node scripts/testing/m9-routine-library.mjs`, con `embedded-postgres@17.10.0-beta.17` fuera del repo. Advisors de seguridad sobre ese PostgreSQL local: sin errores ni findings nuevos; 3 warnings en funciones existentes cargadas por el fixture (`set_updated_at`, `normalize_name`, `trg_routines_normalize_nombre`). Activar con `OWNLEVEL_RUN_ADVISORS=1`.

Rollout autorizado por el usuario el 2026-10-12: A publicado y mergeado en PR #204; migración B aplicada al proyecto `gym` (`vtxacamtayeqnogxyapd`) y verificados check, RPC invoker, permisos y trigger. Supabase asignó la versión `20261012230412`: el archivo local se alineó con esa versión antes del commit. Advisors remotos: INFO esperado por el contador privado con RLS sin policies ni grants de cliente; warnings de RPC definer existentes y protección de contraseñas preexistentes, sin warnings nuevos de B. Backend/Web B se publican antes de adoptar C. El QA funcional nativo completo sigue a cargo del usuario.

C (2026-10-12): duplicación desde activas o archivadas con detalle real antes de abrir la hoja; nombre/color editables, copia con color null conservado e intentos idempotentes. Si una clave futura no se reconoce, exige elegir color para copiar. Los conteos de la vista previa vienen del detalle y la copia confirmada aparece junto a la original incluso si falla la lectura posterior. Ordenar captura versión/lista confirmadas; manijas con gesto JS estable, sombra, alturas medidas para Dynamic Type y scroll al borde; movimiento instantáneo y sin haptics añadidos. VoiceOver tiene acciones arriba/abajo. Listo guarda una vez; conflicto/fallo revierte el borrador y lee el servidor, conservando unavailable/lectura vieja si esa lectura falla. El orden devuelto por el servidor se conserva (no se reordena con una colación local distinta). Doce colores, dos filas de seis, targets 48 y checks con contraste ≥3:1. Sin nuevas dependencias ni rebuild nativo.

Validación de C: `npm run validate` Mobile, 111 suites / 865 tests; typecheck raíz; exportación de bundles iOS/Android. Pruebas nuevas: HTTP esperado de duplicate/order y conflicto de lista sin retry, versiones ausentes/unavailable/0 distintas, detalle fallido sin datos inventados, copia desde archivadas/null, retry con mismo intent, orden optimista/CAS/rollback, gestos reales con continuidad tras render y cancelación, slots de alturas distintas y doce checks claro/oscuro. Backend B publicado y mergeado en PR #205; Vercel producción `dcb6e01` READY. Smoke de las tres rutas de rutinas en `www.ownlevel.fit`: 401 sin bearer, sin escrituras de prueba en datos reales. C queda autorizado para commit/push/PR/merge por el usuario; QA visual y funcional en Simulator/iPhone sigue pendiente.

### 9f. Biblioteca de ejercicios · decisión Mobile (2026-10-13)

Pedido explícito de producto: el catálogo Mobile describe identidad y notas; los objetivos viven en cada rutina. Crear envía los seis `suggested*` en null. Agregar desde el editor, Crear y la ficha usa una plantilla con CAS: una serie, reps/peso/RIR vacíos, sin descanso y mantener. No se usa `routineIds` para agregar, porque ese camino del servidor precarga los valores sugeridos.

La diferencia temporal con Web está aceptada: Web conserva sus valores por defecto y se rediseñará después. El EXPAND autorizado el 2026-10-13 agrega `mobile_update_training_exercise_identity`: identidad solamente, con CAS `expectedUpdatedAt`, bloqueo compartido de Training, ownership/RLS y `EXERCISE_CHANGED` explícito. No reescribe sugeridos, estado, asociaciones ni snapshots. El PATCH completo anterior sigue disponible para clientes anteriores.

El inicio Mobile adopta `templateTargetsOnly: true` y el RPC aditivo `mobile_start_training_session_from_template`, que copia los objetivos de la plantilla sin rellenar null con sugeridos de Web. Conserva snapshots, lock de Training, sesión única y el ledger existente; la política forma parte del hash, de modo que la misma clave no puede iniciar dos veces cambiando de política. El inicio Web y el RPC Mobile anterior mantienen el fallback. Agregar ejercicios durante una sesión activa conserva su precarga del servidor y queda como paso aparte.

Rollout: aplicar `20261013211730_mobile_exercise_identity_template_start_expand.sql` antes de desplegar la API y distribuir Mobile; verificar firmas/permisos, observar errores y conflictos, sin CONTRACT ni borrado de defaults. Si falta un RPC, la API falla de forma explícita; nunca deriva una escritura al comportamiento antiguo ni reintenta automáticamente. La migración está preparada y probada en PostgreSQL local; no aplicada a la base remota desde este trabajo.

La ficha muestra vínculos con rutinas activas (alcance del catálogo actual), sin inventar posición ni series. Última vez usa el detalle de la sesión confirmada y su modo de peso histórico. El título nativo se conserva; nombres largos también aparecen completos en el contenido. iOS usa buscador y menús nativos; Android, controles compartidos. Las filas alojadas en SwiftUI reciben el ancho real de la lista y los selectores tienen altura estable. Catálogo externo e imágenes quedan para el futuro.

### 9g. Inicio · semana y Métricas (2026-10-14)

Pedido explícito del usuario: Nutrición semanal aprobada; Hábitos como tercera página y tres círculos de Métricas bien distribuidos por pantalla, con el resto y Más dentro del mismo scroll. Se autoriza ampliar backend de forma aditiva para Hábitos, preservando los contratos actuales. Esta es una excepción de alcance a §10, limitada a esa lectura; no cambia el motor de analytics ni los write paths.

Implementación y contrato: [Inicio Mobile](real-home.md). `GET /api/mobile/v1/progress/habits` devuelve todas las métricas activas, incluso sin muestras, con semana lunes–domingo y referencia explícita a la semana anterior completa. Promedios de días terminados y comparabilidad calculados por el motor existente. Sin migración SQL; desplegar EXPAND antes de distribuir ADOPT. Las lecturas fallidas no fabrican estados vacíos. Los endpoints y presets anteriores se conservan.

Inicio vuelve a tener Entrenos, Nutrición y Hábitos, sin scroll interno. Métricas reparte el ancho normal en tres columnas, preserva orden/estados confirmados y el espacio de expansión del vidrio. QA nativo del usuario pendiente; no se declara completado con tests.

## 10. Exclusiones y zonas protegidas

- **M3.3 Active Session está cerrado.** Sus archivos (`training/active-session-*`, `session-*`, `finish-session-sheet.tsx`, `completed-session-*`, `summary-slider.tsx`, `app/(tabs)/train/session/[id].tsx`) entran en M9.3 como cualquier pantalla, al final y **solo con cambios visuales**: no tocar drafts, autosave, CAS/conflictos, timer ni mutaciones. Ahí viven 2 de los 3 usos de `tabular-nums`, el check verde de set completado (C3) y hex hardcodeados.
- No se toca: semántica de datos, analytics (M7), contratos de API, write paths, Supabase, Vercel, Capacitor legacy (`mobile/`, `ios/`).
- No se agregan funciones nuevas en M9 salvo las que exige la identidad o la tienda:
  - interruptor de vibración (`IDENTIDAD.md`: "La vibración se puede apagar desde los Ajustes de la app.");
  - eliminación de cuenta dentro de la app (requisito de App Store; decisión de producto y backend aparte, ver M9.5).
- Fuera de esas dos, cualquier preferencia o feature nueva necesita pedido explícito.

## 11. Cómo trabaja un agente en M9

1. Leer `AGENTS.md`/`CLAUDE.md` → "Identidad de marca" y la parte relevante de `IDENTIDAD.md` + `tokens.ts`.
2. Confirmar en qué PR de §9 cae el pedido; no adelantar fases.
3. Si aparece un conflicto nuevo, agregarlo a §5 y preguntar; no decidir en silencio.
4. Antes de usar un valor: token de marca. Si no existe, no inventar uno; documentar.
5. QA visual en Simulator/iPhone (Mobile) o navegador (Web), light y dark, con "Reducir movimiento" activado y desactivado.
6. No commitear, pushear ni abrir PR salvo pedido explícito (regla general del repo).

### Finalizar entrenamiento · F1–F5 (M9)

Pasada visual dentro de M3.3 y lectura EXPAND aditiva de destacados, autorizada explícitamente. No cambia el recibo de finalizar ni las mutaciones, drafts, autosave, CAS o idempotencia. Contrato, decisiones nativas, semántica de las marcas y validación: [m9-finish-redesign.md](m9-finish-redesign.md).
