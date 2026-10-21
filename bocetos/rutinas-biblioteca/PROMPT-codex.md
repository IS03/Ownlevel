# Biblioteca de rutinas (Mobile) — rediseño + duplicar + reordenar + colores

Lee primero AGENTS.md (sección "Identidad de marca"), docs/brand/ownlevel-marca/IDENTIDAD.md, tema/tokens.ts y docs/mobile/m9-brand-polish-plan.md (§5 C4, §9b, §9d, §10, §11). Esto es M9.3 · Training fuera de la sesión activa, **más** tres capacidades nuevas pedidas explícitamente por el producto (duplicar, reordenar, colores nuevos), que necesitan un paso EXPAND de backend.

## Bocetos (fuente visual)

Carpeta: `bocetos/rutinas-biblioteca/` (PNG exportados de Pencil; el `.pen` original está en `bocetos/bocetos.entrenar.pen`, pero está encriptado y no lo vas a poder leer). Cada lámina tiene arriba una nota que explica la intención. Los bocetos usan Inter y Lucide porque Pencil no tiene SF Pro ni SF Symbols: en iOS va la fuente del sistema y SF Symbols, como dice la marca. Los nombres de ejercicios del boceto 04 son inventados.

- 01-lista.png: lista base. **Diferencia con el boceto:** el botón `•••` de arriba se reemplaza por un botón directo de "Ordenar" (ver más abajo).
- 02-deslizar-izquierda-archivar.png
- 03-variantes-play-USAR-LA-2.png: **usar la variante 2**. La fila no muestra ▶; deslizar a la derecha = Empezar.
- 04-mantener-menu-contextual.png
- 05-archivar-deshacer.png
- 06-pantalla-archivadas.png
- 07-modo-ordenar.png
- 08-hoja-nueva-rutina.png
- 09-hoja-duplicar.png
- 10-paleta-colores.png: usar las filas "Ampliada · claro/oscuro" (12 colores).

No uses las láminas descartadas que hay en el `.pen` (grilla "B", lista con ▶ visible, menú `•••` con "Restaurar plan inicial").

## Archivos de partida

- apps/mobile/src/training/routines-screen.tsx (pantalla actual, hoja de nueva rutina incluida)
- apps/mobile/src/training/routine-colors.ts
- apps/mobile/src/api/routines.ts (parser de rutinas y lista de claves de color)
- apps/mobile/src/training/use-session-starter.tsx y start-confirm(.ios).tsx (flujo de inicio existente)
- apps/mobile/src/training/routine-editor-screen.tsx (modal de editar nombre y color, con su mutación y control de versión)
- Patrones nativos ya usados: home-add-menu.ios.tsx, session-next-options.ios.tsx, new-session-sheet.ios.tsx (`@expo/ui`, hoja ajustada al contenido)
- Backend y Web de colores: supabase/migrations/20260827013625_routine_color_preset_keys.sql (check `routines_color_preset_key`), las RPC que repiten la lista de claves (20260927190000_mobile_training_api_expand.sql, 20260928140340_mobile_routine_editor_start_expand.sql), src/lib/phase2/routine-colors.ts, src/app/globals.css (`--routine-*`), src/lib/mobile-api/contracts.ts

## Qué hay que construir

### 1. Lista de rutinas (Mobile, solo UI)
- Large Title nativo "Rutinas". Botón volver de vidrio. A la derecha, dos botones de vidrio circulares: "Ordenar" (SF Symbol `arrow.up.arrow.down`; se oculta si hay menos de 2 activas) y "+" (nueva rutina, ícono en acento). Fuera el texto "+ Nueva".
- Sacar el texto de arriba ("Organizá tus rutinas…"). Va como pie de la sección, en Footnote gris: "Editar una rutina no cambia tus sesiones anteriores."
- Encabezado de sección "Activas" con el conteo "5" en gris (cifras tabulares). Sin "5 activas".
- Fila: tira de color de 4 pt, nombre (Headline), "8 ejercicios · 24 series" (Subheadline gris, `tabular-nums`) y flecha ›. **Sin `•••`.** Tocar la fila abre el editor, como hoy. Si `color` es null, la fila va **sin tira** (hoy cae a gris y parece deshabilitada).
- Deslizar a la izquierda = **Archivar**: acción gris, sin rojo (archivar se puede deshacer). El deslizamiento completo también archiva.
- Deslizar a la derecha = **Empezar**: acción champagne con `play.fill`. Debe pasar por el mismo flujo que el ▶ del resto de la app: `start-confirm` y `use-session-starter` (sesión en curso, idempotencia, reintento). El deslizamiento completo **no** arranca directo: abre la misma confirmación.
- Archivar **sin cartel**: se archiva al toque y aparece un aviso flotante de vidrio "PULL archivada" con "Deshacer" durante unos 4 s. Deshacer llama al restaurar que ya existe. Si el restaurar falla, avisar con el copy de error de la marca (sin culpa, sin exclamación). Mantener el bloqueo de mutaciones en curso que ya tiene la pantalla.
- "Archivadas · 3" pasa a ser una fila que abre una **pantalla propia** (ruta nueva bajo `train/routines`), en vez del desplegable.
- **Quitar "Opciones avanzadas" / "Restaurar plan inicial" de Mobile.** No tocar el endpoint ni la Web (no es un CONTRACT). Borrar de la pantalla el código que queda sin uso.
- Mantener intactos los estados de carga, de no disponible, de lectura vieja ("Mostramos la última lectura confirmada") y el pull to refresh.

### 2. Mantener apretado = menú contextual (boceto 04)
- Menú nativo (en iOS, `@expo/ui` como en los archivos de referencia; en Android, el equivalente RN). Ítems de una activa: Empezar entrenamiento, Editar rutina, Duplicar, Cambiar color, y separado, Archivar (sin rojo). De una archivada: Editar rutina, Duplicar, Restaurar.
- Vista previa con los ejercicios de la rutina, cargados al abrir con el endpoint de detalle que ya existe. Mientras carga o si falla, la vista previa muestra solo el encabezado: nunca datos falsos. Si la vista previa nativa resulta muy costosa, el menú sin vista previa es aceptable: avisame.
- "Cambiar color" tiene que usar la mutación existente con su control de versión. Si la lista no tiene la versión, abrí el modal de editar del editor en vez de inventar otra escritura.

### 3. Pantalla Archivadas (boceto 06)
- Large Title "Archivadas". Filas iguales a las de la lista, con la tira más apagada y **sin** la etiqueta "ARCHIVADA".
- Deslizar a la izquierda = Restaurar. Sin Empezar.
- Pie: "No aparecen al empezar un entrenamiento. Sus sesiones y su historial quedan intactos." **Verificá que sea cierto** en el flujo de inicio; si no lo es, ajustá el texto.
- Vacía: "No tenés rutinas archivadas."

### 4. Hoja Nueva rutina (boceto 08)
- Hoja ajustada al contenido (mismo patrón que Nueva sesión, §9d), apoyada sobre el teclado. X y ✓ de vidrio en la barra de la hoja; el ✓ se habilita recién con un nombre válido, en vez de mostrar el error después.
- Vista previa en vivo de la fila (nombre y color) mientras escribís.
- `TextField` del design system. 12 colores en 2 filas de 6, con zona táctil de 48 (hoy 42, debajo del mínimo).
- Copy: "Los ejercicios los sumás después, en el editor."
- Mantener la idempotencia actual de la creación.

### 5. Duplicar (boceto 09) — necesita backend
- Desde el menú contextual. Reutiliza la misma hoja, titulada "Duplicar PUSH" y precargada con "PUSH copia" y el mismo color, los dos editables. Pista: "Se copian los 8 ejercicios con sus series. PUSH queda igual."
- La copia queda activa y aparece justo debajo de la original. La original no cambia. No se copian sesiones, historial ni snapshots.

### 6. Reordenar arrastrando (boceto 07) — necesita backend
- El botón "Ordenar" entra en modo edición: manijas ≡ a la derecha, la fila arrastrada se levanta con sombra y arriba aparece "Listo" para guardar. Solo se ordenan las activas.
- El orden se aplica en la pantalla al instante. Si falla el guardado, vuelve al orden del servidor y aparece un aviso.
- Ya están reanimated y gesture-handler. Preferí una solución en JS. Si necesitás una dependencia nativa nueva (implica rebuild), avisá antes.

### 7. Colores (boceto 10) — decisión C4 tomada
Implementación elegida (la más simple):
- Las **8 claves actuales no cambian**: solo cambia el hex que pinta cada una, en Mobile (`routine-colors.ts`) **y** en Web (`--routine-*` en `globals.css`) a la vez. No hay migración de datos.
- Se suman **4 claves nuevas**: `sand` (Arena), `stone` (Piedra), `slate` (Pizarra) y `graphite` (Grafito). Requiere EXPAND: ampliar el check `routines_color_preset_key`, las listas de claves de las RPC, `ROUTINE_COLOR_KEYS`/presets/CSS de Web, los contratos de la API Mobile y el parser Mobile.
- Hex, claro / oscuro:
  - violet #6B5BA8 / #A99BD6
  - indigo #4A5694 / #8E97D0
  - blue #3F6A96 / #7FA3C9
  - cyan #2F7A72 / #6FB3AA
  - green #5E7346 / #9DB07F
  - yellow #B08A3E / #D4B26A
  - orange #A3573A / #D08C6A
  - rose #9C4A6B / #CF8AA6
  - sand #A8935F / #DCCBA3
  - stone #8A7F72 / #B8AC9C
  - slate #5B6B7A / #9AAABB
  - graphite #3F3F46 / #A1A1AA
- Arena se parece al champagne del acento: como color de rutina solo pinta la tira o el punto, nunca botones ni estados activos. Verificá el contraste del check blanco sobre cada color (en oscuro probablemente vaya oscuro) y no hardcodees `#17131F`/`#FFFFFF` (ver §9b).
- Compatibilidad: hoy `parseRoutine` descarta una rutina con una clave desconocida. Antes de permitir las claves nuevas en la base, el parser Mobile tiene que tolerarlas (clave desconocida = sin tira, sin perder la rutina). Revisá lo mismo en el resto de los parsers que leen `color` (home, training, active-session, exercises). En Web, `resolveRoutineColor` cae a violeta; agregá las claves nuevas.
- Registrá la decisión C4 en el plan M9 (§5) y en IDENTIDAD.md si corresponde (pedime OK para IDENTIDAD.md).

## Backend (EXPAND) para duplicar, reordenar y colores

Proponé el diseño antes de escribir código. Mínimos:
- Identidad desde el bearer token y ownership/RLS. Nunca un userId del cliente. Sin service_role en caminos de cliente.
- **Duplicar:** endpoint Mobile v1 (por ejemplo `POST /training/routines/{id}/duplicate` con `name`, `color` e `idempotencyKey`) y una RPC transaccional que copie la rutina con sus ejercicios y series planificadas. Reintento con la misma clave = la misma rutina creada; misma clave con otros datos = conflicto, igual que en crear. Orden: justo después de la original, corriendo las siguientes en la misma transacción.
- **Reordenar:** endpoint con la lista ordenada de ids de las activas. Atómico. Rechazar con conflicto si la lista no coincide exactamente con las activas del usuario (se agregó o archivó una mientras tanto); el cliente vuelve a leer. Evaluá si hace falta versión de lista para evitar pisadas entre dispositivos y justificá la decisión.
- Las migraciones van como archivos en `supabase/migrations` con sus tests en `supabase/tests`. **No las apliques a la base remota sin mi OK explícito.**
- Los cambios de Web se limitan a soportar las claves nuevas y el nuevo tono. Duplicar y reordenar en Web no entran en este trabajo, pero el backend tiene que poder usarlos.

## Fases (cortes reales)

1. **PR A · Mobile UI sin backend:** puntos 1 a 4, el menú sin Duplicar, el nuevo tono de las 8 claves (Mobile + Web) y el parser tolerante.
2. **PR B · EXPAND backend:** migraciones, RPC, endpoints, contratos y claves de Web para duplicar, reordenar y colores nuevos.
3. **PR C · Mobile ADOPT:** Duplicar, modo ordenar y los 12 colores en las hojas.

Si ves una forma mejor de cortar, proponela.

## Reglas
- Antes de implementar, presentá el plan con alcance, riesgos y archivos, y esperá mi OK.
- Marca: un solo acento, sin rojo para archivar, vidrio solo en controles (botones de la barra, aviso flotante, hoja), nada de vidrio en filas ni tarjetas, cifras tabulares, escala tipográfica y medidas de la marca, voseo y copy sin exclamaciones en avisos. Haptics solo según la tabla de la marca (C12): si ningún evento corresponde, sin haptic.
- No cambiar la semántica de datos más allá de lo pedido. missing ≠ zero, empty ≠ unavailable: no mostrar estado vacío falso si la lectura falló.
- Respetar "Reducir movimiento" (fundidos) y probar en claro y oscuro.
- Validar con `npm run validate` en apps/mobile y las validaciones de raíz que correspondan (tests, lint, typecheck, tests de supabase).
- No commitear, pushear ni abrir PR hasta que lo pida. Yo hago el QA en el Simulator y el iPhone.
