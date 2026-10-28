# #303 · registro de ejecución

Registro corto para retomar la ejecución autónoma. El diagnóstico y las decisiones están en [performance-read-reuse.md](performance-read-reuse.md).

| Bloque | Estado | Rama / PR |
|---|---|---|
| A · Nutrición | Fusionado | #319 (`4f100e0`) |
| B · Inicio y Entrenar | Fusionado | #320 (`5a6872c`) |
| C · Ajustes y Progreso restante | Fusionado | #321 (`f3c6c24`) |
| D · Revisión final | Hecha, sin defectos nuevos | incluida en #321 |

- Base: `main` en `f9b30b1` (#316, #317 y #318 fusionadas).
- Worktree: `/Users/ignaciosenestrari/Proyectos/Ownlevel-303-review`, con `node_modules` enlazado al worktree de Codex de #303.
- Últimas pruebas: `npm run validate` del bloque C, 175 suites / 1.430 pruebas OK.
- Bloqueos: ninguno.
- QA físico: no realizado en esta ejecución; queda pendiente de una sesión integral.
- Estado de entrega: #319, #320 y #321 fusionadas; #303 cerrado. QA físico integral pendiente, separado de la revisión técnica.

## Revisión independiente post-merge · 28/10/2026

- Baseline: `main` en `f3c6c24`, con #318–#321 fusionadas.
- Defecto reproducido en Inicio y Entrenar: si una lectura lenta empezó antes de una escritura en otra sección, el retorno detectaba el contador nuevo pero usaba `refresh`, que se sumaba a la petición anterior. Esa respuesta podía aceptarse como fresca y quedar visible dentro de la ventana de reutilización. Afecta la lectura; no se demostró pérdida de escrituras.
- Corrección: al detectar escrituras nuevas, los lectores propios de ambas pantallas usan `reload` para abortar y descartar respuestas anteriores. El foco sin escrituras conserva la vigencia/deduplicación existente; el refresh manual de Inicio aplica la misma protección si detecta una escritura nueva. No se modifica el controlador de sesión activa, la caché compartida ni los contratos de escritura.
- Tres casos de regresión (foco de Inicio, refresh manual de Inicio y foco de Entrenar) fallaron antes de sus correcciones y pasan después, incluyendo una respuesta antigua que llega última e ignora el abort.
- Se revisaron invalidación/reload/LRU de la caché compartida, rutas/resultados del cliente, reutilización de días/reportes de Nutrición, foco/foreground de Ajustes, clientes por cuenta y garantías #316/#317. No se demostró otro defecto en este alcance; esto no reemplaza mediciones ni QA físico de Release.
- Validación: una ejecución completa de `npm run validate` pasó (tipos, lint sin warnings, 175 suites / 1.432 pruebas y configuración). Tras extender el mismo arreglo al refresh manual de Inicio, se repitieron únicamente tipos, lint y las dos suites afectadas: 34 pruebas OK. `git diff --check` pasó. Se conservan advertencias de `act(...)` en tests de pantalla, sin fallos.
- Sin build, cambios en Metro, QA físico intermedio, reapertura de #303 ni inicio de issues visuales.
