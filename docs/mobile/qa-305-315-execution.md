# QA Mobile #305–#315 · registro de ejecución

Registro corto para retomar la ejecución autónoma. Contrastar siempre con Git y GitHub antes de seguir.

| Issue | Tema | Estado | PR |
|---|---|---|---|
| #306 | Franja inferior en Alimentos / Comidas guardadas (+ teclado tapa «Guardar») | Fusionado; falta confirmación en iPhone | #330 |
| #309 | Selector de Desglose tapa el título | Fusionado | #323 |
| #310 | «Cuándo comés» cambia de altura | Fusionado | #323 |
| #311 | Spinner de Ajustes desplaza filas | Fusionado | #323 |
| #305 | Historial rápido en sesión | Fusionado (sin simulador: requiere iniciar una sesión real) | #325 |
| #312 | Energía: extra si entrenás sin animación | Fusionado | #324 |
| #313 | Picker de Nacimiento | Fusionado | #324 |
| #314 | Selectores de Datos físicos | Fusionado | #324 |
| #307 | Editar/borrar comidas de ChatGPT | Fusionado; migración EXPAND aplicada a producción (`20261028084439`) | #326 |
| #308 | Hora y tipo en comidas de ChatGPT | Fusionado; complemento actualizado; abierto hasta la prueba real | #326 |
| #315 | Peso rápido desde Ajustes | Fusionado (simulador: abrir y cerrar sin guardar) | #327 |
| — | Fecha del peso en inglés («28 Oct 2026») | Fusionado | #331 |

- Base: `main` en `a0d8ee8` (#322 fusionada).
- Worktree: `/Users/ignaciosenestrari/Proyectos/Ownlevel-303-review`, en `main` `fd39e18` (#323–#327 fusionadas; `npm run validate` en verde: 176 suites, 1445 tests). `node_modules` enlazado al worktree de Codex de #303; `.env.local` copiado del checkout principal (ignorado por Git).
- Simulador: iPhone 18 Pro (iOS 27) con OWNLEVEL Dev, conectado a un Metro propio en `:8082`. El Metro del checkout principal (`:8081`) no se tocó.
- #306: con las capturas del iPhone y una lista larga se reprodujo en el simulador. Causa medida con `onLayout`: el `Modal` de `LibrarySheet` heredaba los insets de la pestaña (34 + 49 de la barra = 83 pt) y montaba siempre un pie vacío (12 pt); el `ScrollView` terminaba 95 pt antes del borde. En el mismo componente, el `KeyboardAvoidingView` usaba su frame relativo al padre y calculaba el teclado ~57 pt corto (tapaba «Guardar»). Corregido en #330 (`SafeAreaProvider` propio, pie condicional y `keyboardVerticalOffset`).
- #309: causa confirmada en el simulador. El `Host` SwiftUI de `ExerciseSegmented` no ignoraba el área segura: montado bajo la barra de pestañas, SwiftUI dibujaba el control ~26 pt más arriba. Mismo patrón ya usado en otros controles nativos (`ignoreSafeArea="all"`).
- Pendiente para el bloque B: los dos `Host` de `settings/physical-controls.ios.tsx` tampoco ignoran el área segura (posible causa del salto de Altura de #314).
- Bloque B: patrón `EditorialMove` / `EditorialExpansion` en `settings/editorial.tsx` (mismo que `stage-plan-screen`); Sexo pasa a `SettingsSegmented`; Nacimiento y Altura con alto fijo, `ignoreSafeArea`, `labelsHidden` y locale `es_AR`.
- Metro propio en `:8082` sirve `main` desde el worktree; el simulador apunta a él. Para volver al Metro del usuario: abrir `ownlevel-dev://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`.
- #307/#308: la RPC `mobile_mutate_manual_meal` edita/borra comidas `chatgpt` (origen interno conservado); `create_chatgpt_meal_for_integration_v2` y `create_chatgpt_meal_for_oauth_v2` aceptan hora y tipo; las versiones actuales delegan. Sin hora: `raw_input={"originalTimeKnown":false}`. Probado en Postgres descartable (`scripts/testing/qa-307-308-chatgpt-meals.mjs`, 9 grupos) y aplicado a producción antes del merge; cuerpos verificados por MD5. Filas históricas sin cambios.
- Raíz: `src/lib/daily-metrics/write-reliability.test.ts` y `src/lib/nutrition/pr73.test.ts` ya fallan en `main` (aserciones sobre texto de código fuente); ajenos a este trabajo.
- #315: la fila Peso (con historial) abre la hoja de Cuerpo en el lugar (mismo `BodyController`, write path, CAS y aviso de reemplazo del mismo día); tras guardar, Ajustes relee la configuración porque su versión incluye el último peso. Sin historial, el primer peso sigue en el formulario físico.
## Estado actual
- Terminado: #305–#307 y #309–#315 cerrados; fecha del peso en español (#331).
- PRs: #323–#331 fusionadas; ninguna abierta.
- Última validación: `main` `c2f479f`, `npm run validate` en verde (178 suites, 1450 tests).
- Bloqueos: #308 espera la prueba real desde ChatGPT (sin comidas de prueba).
- Próxima acción: QA integral en iPhone sobre el último `main`.
