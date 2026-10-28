# QA Mobile #305–#315 · registro de ejecución

Registro corto para retomar la ejecución autónoma. Contrastar siempre con Git y GitHub antes de seguir.

| Issue | Tema | Estado | PR |
|---|---|---|---|
| #306 | Franja negra en Alimentos / Comidas guardadas | Bloqueado: no reproducido | — |
| #309 | Selector de Desglose tapa el título | Fusionado | #323 |
| #310 | «Cuándo comés» cambia de altura | Fusionado | #323 |
| #311 | Spinner de Ajustes desplaza filas | Fusionado | #323 |
| #305 | Historial rápido en sesión | En curso: causa hallada (botón «Usar» de 50 pt infla la cabecera de cada tarjeta, `training/active-session-sheets.tsx`) | — |
| #312 | Energía: extra si entrenás sin animación | Validado | Bloque B |
| #313 | Picker de Nacimiento | Validado (simulador) | Bloque B |
| #314 | Selectores de Datos físicos | Validado (simulador) | Bloque B |
| #307 | Editar/borrar comidas de ChatGPT | Pendiente | — |
| #308 | Hora y tipo en comidas de ChatGPT | Pendiente | — |
| #315 | Peso rápido desde Ajustes | Pendiente | — |

- Base: `main` en `a0d8ee8` (#322 fusionada).
- Worktree: `/Users/ignaciosenestrari/Proyectos/Ownlevel-303-review`, rama `claude/qa-native-b` (sale de `claude/qa-visual-a`, ya fusionada en #323). `node_modules` enlazado al worktree de Codex de #303; `.env.local` copiado del checkout principal (ignorado por Git).
- Simulador: iPhone 18 Pro (iOS 27) con OWNLEVEL Dev, conectado a un Metro propio en `:8082`. El Metro del checkout principal (`:8081`) no se tocó.
- #306: sin franja en el simulador en lista y edición de Comidas guardadas, en tema claro y oscuro, con y sin teclado. Hace falta una captura del dispositivo (pantalla exacta y tema) antes de cambiar código; se mantiene abierto.
- #309: causa confirmada en el simulador. El `Host` SwiftUI de `ExerciseSegmented` no ignoraba el área segura: montado bajo la barra de pestañas, SwiftUI dibujaba el control ~26 pt más arriba. Mismo patrón ya usado en otros controles nativos (`ignoreSafeArea="all"`).
- Pendiente para el bloque B: los dos `Host` de `settings/physical-controls.ios.tsx` tampoco ignoran el área segura (posible causa del salto de Altura de #314).
- Bloque B: patrón `EditorialMove` / `EditorialExpansion` en `settings/editorial.tsx` (mismo que `stage-plan-screen`); Sexo pasa a `SettingsSegmented`; Nacimiento y Altura con alto fijo, `ignoreSafeArea`, `labelsHidden` y locale `es_AR`.
- Metro propio en `:8082` sigue corriendo desde el worktree; el simulador apunta a él. Para volver al Metro del usuario: abrir `ownlevel-dev://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`.
- Próxima acción: fusionar la PR del bloque B cuando CI pase y cerrar #312–#314; terminar #305 (cabecera compacta con «Usar» de 44 pt); después bloque C (#307, #308, #315).
