# Dock: captura del fallo completo, 8 de noviembre de 2026

Se capturó el fallo real. La corrección es del test, no del producto: esperar el `rerenderAsync` de la ruta antes de comenzar a consultar la desaparición. Se conservan las expectativas originales, sus cantidades de lecturas y el timeout. Se agrega una regresión con respuesta retenida, navegación durante el flight y eliminación solo después de confirmar ausencia. No cambian store, dock, invalidación, escrituras ni recuperación.

## Árboles y alcance

- Main: `4859c017dafe7d640eeb4c807c388582363d6650`.
- #428: `e22259bc132df22ce5adb8f834ada9c83df031c2`.
- #429: `0de199bc67e3df46b1cdd61b7feaa6e7fac8a1be`.
- #430: `024c9b6e2145729c84e6d2c6c7710a50fc58da44`.
- Combinación original preservada: `552dc723c4363733350920b91a15c64ab1903268`.
- Instrumentación de la única corrida completa: `7910e4d518572143c21a8edbaf03f8cb8431de5d`, rama **local, sin publicar** `codex/dock-full-diagnostic`. Su head posterior `eac67a97ebbc898ac32c02438c38d675ebe2ab4f` conserva el replay v2.
- Corrección limpia sobre main: `ae5259edda79e3e25530d2a256eb3d7c4f55bdfc`.
- Combinación con esa corrección: `6124bd671cbb718e1acb2f4fd70d0f0928b02bf6`, rama local `codex/dock-polish-replay-check`. Al aplicar solo el commit de pruebas hubo un conflicto en las entradas de previews de `vercel.json`: se conservaron las tres de la tanda y la nueva, todas `false`. No hubo conflicto de código.

#428–#430 no se modificaron. La corrección publicada parte de main y es independiente de sus implementaciones. La instrumentación y los controles del scheduler no forman parte de los fuentes entregables.

## Captura estándar

Desde `apps/mobile`:

```text
npm test -- --json --outputFile=C:/Users/senes/AppData/Local/Temp/ownlevel-dock-full-20261108/results.json --showSeed
```

Es el script vigente `jest --runInBand`, con configuración, setup, secuenciador y caché estándar. No se eligió una semilla ni se cambiaron workers, expectativas o timeouts. Se agregaron únicamente salidas de artefactos. Configuración efectiva en `config.log`; semilla **149602922**. Node 22.18.0, npm 11.5.2, Jest 29.7.0, jest-expo 57.0.5, React/renderer 19.2.3, RN 0.86.3, RNTL 13.3.3. Versiones completas, orden observado de los 206 archivos y hashes en [evidencia](dock-captura-2026-11-08.evidence.json).

**196,611 s; 205 suites aprobadas / 1 fallida; 1.718 pruebas aprobadas / 1 fallida.** Único fallo: `reads presence once across five quick route changes, and revalidates after a settled write`. Falló `toBeNull()` dentro de `waitFor`; no fue timeout del runner ni rechazo suelto. La prueba duró 1.596 ms. El error guardado contiene un ReactTestInstance con `_fiber`.

Buffer circular en memoria, máximo 4.096 eventos; **368 conservados, 0 descartados**. Sin console por evento, I/O ni awaits adicionales durante el recorrido. El volcado se efectuó al fallar, devolviendo intacto el error del timeout. IDs de store/read/cache sintéticos, respuestas resumidas como estados y booleanos, rutas normalizadas; sin identidad, payloads privados ni credenciales.

## Intercalación que falló

|Evento|Qué demuestra|
|---|---|
|349–352|La invalidación mueve escrituras 0 → 1; no hay entradas retenidas ni lectura iniciada desde la caché.|
|353–354|Se instala `active.absent.once` antes de revalidar.|
|355–362|Cambio a `/train`; comienza el segundo flight y el mock correcto entrega ausencia.|
|363–366|765 ms después, se procesa la respuesta: revisión 0 vigente, ninguna respuesta descartada, ausencia publicada, escrituras confirmadas 1, flight terminado.|
|367–368|Al vencer `waitFor`, store **sin sesión**, flight **cerrado**, dos lecturas de presencia, una de detalle y árbol renderizado **sin dock**. Aun así se rechaza con un error anterior que recibió el dock.|

No se acredita consumo prematuro del siguiente mock, una tercera lectura, sobrescritura tardía, revalidación perdida ni dock persistente en esta captura. Tampoco se generaliza esa conclusión a otros fallos que no se hayan capturado.

## Causa y reproducción dirigida

El `rerender` síncrono inicia trabajo asíncrono de presencia, pero no lo asienta antes de entrar a `waitFor`. En la captura, la espera termina rechazando una expectativa vieja aunque la ausencia ya esté publicada y renderizada. La evaluación fallida recibe el objeto interno de React, y monopoliza el hilo antes de dar paso a las microtareas y al commit.

Sondas acotadas posteriores, sin otra corrida completa:

- Caso aislado: pasa; dos evaluaciones fallidas tardan **830 y 725 ms**, y la tercera pasa con el dock ausente. El total supera el segundo estándar, sin que eso garantice el mismo orden de los callbacks vencidos.
- Archivo completo aislado: 12/12; evaluaciones de **933 y 751 ms**. Una sonda de `printReceived` no interceptó llamadas: no se usa para atribuir CPU a una función interna concreta. Lo medido es la evaluación completa del matcher y su error con Fiber.
- Replay dirigido: primera evaluación con dock presente → procesar respuesta y commit → despachar vencimiento antes de otro poll. Reproduce el rechazo obsoleto con el store y el árbol ya vacíos. No agrega demoras ni modifica el timeout; controla el **orden** de callbacks, no reproduce duración de pared.
- Mismo replay, cambiando solamente el último render por `await view.rerenderAsync(view.screen())`: el primer poll ve ausencia y cancela el vencimiento. **Falla antes / pasa después**. El orden invalidación → instalación del mock → ruta permanece igual.

El replay v1 se conservó pero quedó reemplazado: despachaba también un timeout que ya había sido cancelado después del éxito. V2 respeta `clearTimeout`/`clearInterval`: antes falla (semilla −703252161), después pasa (715742208), con vencimiento pendiente solo antes. No se utilizó v1 para acreditar cancelación. Todos los intentos y sus JSON permanecen disponibles, incluidos los verdes sin corrección.

La conclusión demostrada es una carrera de sincronización de la prueba con trabajo de React pendiente y polling real; **no un defecto acreditado del dock productivo**. No se necesita modificar sus garantías ni cambiar el matcher para resolverla.

## Regresión y validación limpia

```text
npm test -- --runTestsByPath src/training/session-return-dock.test.tsx src/training/session-presence-store.test.ts src/training/active-session-bridge-screen.test.tsx --json --outputFile=<artefactos>/final-related.json --showSeed
npm run typecheck
npm run lint
```

- Main + corrección: **70/70**, tres suites, 10,244 s, semilla 253610018. Tipos y lint aprobados.
- Combinación + mismo cambio: **73/73**, tres suites, 9,813 s, semilla 611886205. Incluye las tres pruebas adicionales de #428. Durante esa ejecución solo quedaba sin resolver el conflicto de metadatos de previews; el fuente probado coincide exactamente con el commit de combinación indicado arriba. Resolver ese JSON no altera las suites.
- Nueva regresión: respuesta retenida mantiene el dock; otra ruta se une al flight sin duplicar lectura; resolver ausencia dentro de `act` elimina el dock y mantiene dos lecturas / un detalle; desmontaje explícito. Los casos existentes conservan comprobaciones de cuentas, listeners, foreground, timers y limpieza.

**No hay validación completa posterior a la corrección.** Se respetó la única corrida completa diagnóstica autorizada; esa corrida fue roja y queda conservada. Los verdes dirigidos no se presentan como aprobación del gate completo ni prueba de inexistencia de otros fallos. No se repitió config check: no cambió su entrada funcional.

## Artefactos y límites

Directorio local: `C:\Users\senes\AppData\Local\Temp\ownlevel-dock-full-20261108`.

`manifest.json`, `config.log`, `results.json`, `full.log`, `order.json`, `trace.json`; patches de instrumentación y replay; JSON/log/traza de cada sonda y de antes/después; resultados limpios de main y combinación. El JSON adjunto conserva hashes SHA-256 y el extracto 349–368 sin renumerar. La traza completa de 368 eventos está en el directorio local y el archivo comprimido de entrega.

Para reconstruir las sondas en un árbol aislado: combinación original + `instrumentation.patch` = fuente de la corrida completa; sumar `replay-v2-before.patch` o `replay-v2-after.patch` = replay antes/después. Esos patches están archivados como evidencia local, **no se deben integrar**. El replay utiliza `OWNLEVEL_DOCK_REPLAY=1`, `OWNLEVEL_DOCK_CAPTURE_ALL=1`, `OWNLEVEL_DOCK_TRACE_FILE=<archivo propio>` y el filtro de nombre del caso. Las sondas sin replay utilizan el mismo script/filtro, sin esa variable.

No se detuvieron procesos ajenos: los procesos Node preexistentes y sus contadores quedaron registrados; no se acredita su actividad funcional ni ausencia total de carga externa. No se iniciaron campañas ni otras suites pesadas en paralelo con la captura.

Solo se publica la corrección de pruebas, este informe y evidencia, con previews bloqueadas. Sin cambios productivos, merges remotos, builds, instalaciones, QA física ni nuevas tareas. La investigación estadística continúa detenida.
