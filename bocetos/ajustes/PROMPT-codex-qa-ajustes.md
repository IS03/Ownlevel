# Prompt · QA de Ajustes en el simulador

Para pegar en Codex tal cual.

```
Ajustes · QA en el simulador y correcciones

Contexto
- Repo OWNLEVEL. Leé AGENTS.md y las partes de docs/brand/ownlevel-marca/IDENTIDAD.md que toques (tipos, radios, espacios, vidrio, copy).
- Ajustes ya está implementado (PRs #253–#259). Esto NO es un rediseño: hay que recorrer cada pantalla en el simulador, encontrar lo que está mal y corregirlo.
- Referencias de diseño: bocetos/ajustes/PLAN.md (decisiones), bocetos/ajustes/*.png (AJ1–AJ9, R2-AJ-A-editorial, R3-ET3, R3-ET4) y el bloque "Reglas de esta tanda" de bocetos/ajustes/PROMPTS-codex.md, que sigue valiendo.
- Rama nueva desde main: codex/ajustes-qa.

Qué pantallas
| Pantalla | Ruta (deep link) | Código |
|---|---|---|
| Ajustes | ownlevel-dev:///settings | src/settings/settings-screen.tsx, editorial.tsx |
| Cuenta / Perfil | ownlevel-dev:///settings/account | src/settings/account-screen.tsx, account-avatar.tsx |
| App (tema, vibración) | ownlevel-dev:///settings/app | src/settings/app-screen.tsx |
| Energía | ownlevel-dev:///settings/energy | src/settings/configuration-screen.tsx |
| Datos físicos | ownlevel-dev:///settings/physical | src/settings/configuration-screen.tsx, physical-controls.* |
| Etapas y plan por día | ownlevel-dev:///settings/stages (+ stage-plan, stage-action, stage-sequence) | src/stages/* |
| Métricas | ownlevel-dev:///settings/metrics | src/metrics/definitions-* , definition-drag-list.tsx |
| Eliminar cuenta | ownlevel-dev:///settings/delete-account | src/settings/delete-account-screen.tsx |
| Diagnóstico | ownlevel-dev:///settings/diagnostics | app/settings/diagnostics.tsx |
También: Nutrición › ••• abre las mismas pantallas de plan; revisá que lleguen igual.

Cómo usar el simulador
- Hay un iPhone booteado con el development build y Metro en el puerto 8081, servido desde esta carpeta (apps/mobile). Importante: Metro sirve lo que está en esta carpeta. Si cambiás de rama, la app cambia. Trabajá en esta misma carpeta, en tu rama, y recargá la app para ver tus cambios.
- Abrir la app en Metro: xcrun simctl openurl booted "exp+ownlevel-mobile://expo-development-client/?url=http%3A%2F%2F192.168.0.25%3A8081"
- Ir a una pantalla: xcrun simctl openurl booted "ownlevel-dev:///settings/energy"
- Capturas: xcrun simctl io booted screenshot --type=png /tmp/qa/<nombre>.png (mirá cada captura antes de seguir).
- Para animaciones: ráfaga de capturas en segundo plano mientras ocurre la acción y revisalas cuadro a cuadro.
- Variantes a recorrer en cada pantalla:
  - claro y oscuro: xcrun simctl ui booted appearance dark|light
  - letra grande: xcrun simctl ui booted content_size accessibility-large (y volver con large)
  - Reducir movimiento: defaults write com.apple.Accessibility ReduceMotionEnabled -bool true en el simulador, y recargar.
  Al terminar, dejá el simulador en claro, letra normal y sin Reducir movimiento.
- Si no podés tocar la pantalla con tus herramientas, navegá con deep links, verificá con capturas y anotá en el reporte lo que quedó sin poder probar a mano.

Datos: es la cuenta real de Nacho
- Se puede abrir todo, mirar, abrir hojas y cancelar.
- NO guardes cambios en plan nutricional, etapas, energía ni datos físicos. Si para probar un guardado hace falta guardar, volvé después exactamente al valor original y anotalo en el reporte.
- Métricas: podés crear una métrica de prueba llamada "QA prueba" para probar crear/editar/ordenar/carga rápida, y al final archivarla.
- Eliminar cuenta: recorrela, pero NUNCA confirmes (no escribas ELIMINAR y confirmes).
- No cierres sesión (volver a entrar necesita a Nacho).
- No crees ni cortes etapas.

Qué revisar en cada pantalla (y corregir)
1. Visual y marca:
   - estilo editorial (sin tarjetas blancas para listas, renglones con línea fina, titulares grandes, el dato en champagne);
   - escala de tipos, radios y espacios de la marca; cifras tabulares; un solo acento;
   - alineación: que los renglones, íconos y textos arranquen en el mismo borde que el resto de la página; nada corrido a la derecha;
   - vidrio solo en controles.
2. Copy: voseo, sin jerga técnica ("intento", "lectura", "V2", "male", "borrador"), sin culpa, sin exclamaciones salvo logros, números con formato de pantalla (111,5 kg).
3. Estados: cargando (esqueleto con la forma final, nunca pantalla en blanco ni "Cargando…" suelto), sin conexión / no disponible (distinto de vacío), vacío útil, guardando → guardado (botón con indicador y ✓, toast de vidrio). Faltar ≠ cero.
4. Hojas y navegación:
   - las hojas entran y salen igual, se cierran arrastrando y con la cruz;
   - cerrar con la cruz no puede dejar un pantallazo blanco: la hoja nativa tiene que bajar antes de que la pantalla la desmonte (ver el arreglo de #282 en src/training/active-session-sheets.tsx);
   - volver atrás siempre lleva a donde corresponde; títulos del encabezado correctos.
5. Teclado: los campos no quedan tapados, "Listo" funciona, la hoja acompaña al teclado.
6. Áreas seguras: botones de abajo a la altura del pulgar. Ojo: una pantalla completa o modal que hereda los márgenes del tab bar queda con botones demasiado altos; ahí va SafeAreaView propia (ver #282, post-workout-screen.tsx).
7. Letra grande: nada cortado letra por letra ni con "…" donde importa; si no entra en una línea, apilar (ver #280, completed-session-view.tsx con fontScale > 1.3).
8. Oscuro: contrastes, champagne correcto (#C9B68A en oscuro, #705F36 para texto en claro).
9. Movimiento: 200/300 ms, resorte suave, presión al 95 %, números que cuentan; con Reducir movimiento solo fundidos. Sin animaciones decorativas ni zooms bruscos.
10. Accesibilidad: etiquetas en botones e íconos, valores de controles ajustables, orden lógico de VoiceOver.

Alcance
- Corregí bugs y pulido dentro de estas pantallas. No agregues funciones ni cambies escrituras, contratos ni semántica de datos.
- Si algo necesita una decisión de producto o un cambio grande (por ejemplo, otra forma de una pantalla), no lo hagas: anotalo como propuesta en el PR con captura.
- Si algo necesita servidor, reportalo como BLOQUEADO con la propuesta de EXPAND.

Cómo trabajar
- Pantalla por pantalla: captura "antes" → arreglo → recarga → captura "después".
- Guardá las capturas que muestren cada arreglo en bocetos/ajustes/qa/ (antes/después, nombres claros).
- Agregá o ajustá tests donde el arreglo cambie comportamiento (por ejemplo, cierre de hojas, estados).

Al terminar
- npm run validate en apps/mobile y npx expo export --platform ios (atrapa imports que Metro no resuelve).
- Commit selectivo (solo tus archivos; no git add -A), push y un PR con:
  - lista por pantalla: qué revisaste, qué estaba mal, qué cambiaste (con capturas de bocetos/ajustes/qa/);
  - lo que no pudiste probar y por qué;
  - si guardaste algo para probar, qué valor y que lo volviste al original;
  - propuestas que no implementaste.
- Dejá el simulador en claro, letra normal, sin Reducir movimiento, y la métrica "QA prueba" archivada.
```
