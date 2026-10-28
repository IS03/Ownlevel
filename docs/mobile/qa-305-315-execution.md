# QA Mobile #305–#315 · registro de ejecución

Registro corto para retomar la ejecución autónoma. Contrastar siempre con Git y GitHub antes de seguir.

| Issue | Tema | Estado | PR |
|---|---|---|---|
| #306 | Franja negra en Alimentos / Comidas guardadas | Bloqueado: no reproducido | — |
| #309 | Selector de Desglose tapa el título | Validado | Bloque A |
| #310 | «Cuándo comés» cambia de altura | Validado | Bloque A |
| #311 | Spinner de Ajustes desplaza filas | Validado | Bloque A |
| #305 | Historial rápido en sesión | Pendiente | — |
| #312 | Energía: extra si entrenás sin animación | Pendiente | — |
| #313 | Picker de Nacimiento | Pendiente | — |
| #314 | Selectores de Datos físicos | Pendiente | — |
| #307 | Editar/borrar comidas de ChatGPT | Pendiente | — |
| #308 | Hora y tipo en comidas de ChatGPT | Pendiente | — |
| #315 | Peso rápido desde Ajustes | Pendiente | — |

- Base: `main` en `a0d8ee8` (#322 fusionada).
- Worktree: `/Users/ignaciosenestrari/Proyectos/Ownlevel-303-review`, rama `claude/qa-visual-a`. `node_modules` enlazado al worktree de Codex de #303; `.env.local` copiado del checkout principal (ignorado por Git).
- Simulador: iPhone 18 Pro (iOS 27) con OWNLEVEL Dev, conectado a un Metro propio en `:8082`. El Metro del checkout principal (`:8081`) no se tocó.
- #306: sin franja en el simulador en lista y edición de Comidas guardadas, en tema claro y oscuro, con y sin teclado. Hace falta una captura del dispositivo (pantalla exacta y tema) antes de cambiar código; se mantiene abierto.
- #309: causa confirmada en el simulador. El `Host` SwiftUI de `ExerciseSegmented` no ignoraba el área segura: montado bajo la barra de pestañas, SwiftUI dibujaba el control ~26 pt más arriba. Mismo patrón ya usado en otros controles nativos (`ignoreSafeArea="all"`).
- Pendiente para el bloque B: los dos `Host` de `settings/physical-controls.ios.tsx` tampoco ignoran el área segura (posible causa del salto de Altura de #314).
- Próxima acción: validar y fusionar el bloque A; seguir con el bloque B.
