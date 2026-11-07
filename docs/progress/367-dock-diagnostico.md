# #367 — Diagnóstico acotado del dock antes de #423–#426

Fecha: 2026-11-07. Investigación local, sin producción, builds, instalaciones, QA física ni cambios en #423–#426. Este informe registra evidencia; una corrida verde no acredita por sí sola una reparación.

## Árboles fijados

| Árbol | SHA verificado |
|---|---|
| main / #422 | `6d94f31ca42839012b62b75aa96764bf39742560` |
| #423 | `8b286f5d3b895d07b0c9a81f59ce52a94160cf69` |
| #424 | `25982d693b4635b981dd401264af997db84e19d4` |
| #425 | `007bd6d16b162832ea759f571dd57ec03334852e` |
| #426 | `f14ed277588e8ef5af28b2b7c4c769eaecb59e58` |
| Combinación que falló | `654a0c970a0bae7b8706f1a2ff0c9ec6a1427e7a` |
| Combinación actual reconstruida | `b588af51446d22590805aad4ae876fa63233ad82` |

El checkout principal estaba limpio en #424. Se preservaron sus ramas, el worktree histórico de recibos y los procesos existentes. Se crearon dos worktrees de diagnóstico aislados, con dependencias existentes compartidas mediante junctions, sin instalar paquetes. Las cachés de Jest son nuevas y distintas por árbol/caso.

La reconstrucción parte de `654a0c9`, que ya conserva las resoluciones de checklist y claves de previews de la combinación anterior. Se aplicaron únicamente `25982d6` y los dos commits posteriores de documentación `007bd6d`/`f14ed27`. No aparecieron conflictos nuevos ni se copiaron implementaciones a una rama independiente. Cadena local: `654a0c9` → `e868896` → `e7acc95` → `b588af5`. No se publican esas integraciones locales.

## Evidencia original recuperada

Se preservó el log `%TEMP%/ownlevel-367-combined-validate.log` en un directorio nuevo de evidencia. SHA256: `8F3E2E6E3F29498D04A04CB135600E38E0109D8A834918B4DBF150AD8EF66E89`. También se preservaron los dos logs de las 69 pruebas relacionadas anteriores.

- Comando: `npm run validate` desde `apps/mobile`; encadena typecheck, lint, `jest --runInBand` y config check. Se detuvo en Jest. El config check posterior fue informado y ejecutado por separado en la entrega anterior.
- Resultado: 204/205 suites y 1.698/1.699 pruebas aprobadas; Jest 199,644 s. El archivo del log fue creado a las 14:52:44 y terminó de escribirse a las 14:56:25, Córdoba; son metadatos del archivo, no una traza de inicio de cada tarea.
- Caso: `global session return dock › reads presence once across five quick route changes, and revalidates after a settled write`.
- Expectativa: `expect(view.queryByTestId('session-return-dock')).toBeNull()`; esperado `null`, recibido un `View` de React Test Renderer con `_fiber`. El conteo final de dos lecturas está después de esa expectativa y no llegó a comprobarse: el log no permite decir cuántas lecturas hubo en el fallo.
- Stack recuperado:

```text
at Object.<anonymous> (src/training/session-return-dock.test.tsx:193:18)
at asyncGeneratorStep (node_modules/@babel/runtime/helpers/asyncToGenerator.js:3:17)
at _next (node_modules/@babel/runtime/helpers/asyncToGenerator.js:17:9)
```

Es un fallo de expectativa dentro de `waitFor`. La implementación instalada de RNTL conserva la última expectativa al terminar la espera; su valor por defecto es 1.000 ms. No figura un timeout de prueba de Jest (`Exceeded timeout`), timeout del runner, worker terminado, `unhandledRejection` ni aviso de proceso que no sale. Esto clasifica el fallo observado, **no explica por qué seguía visible el dock**.

El comando fija un worker mediante `--runInBand`. Se recuperaron 205 informes únicos PASS/FAIL, con el dock en la posición 18; el informe fallido se repite en el resumen final y se deduplicó. Se conserva ese orden observado para comparar. La semilla original, una traza timestamped de inicio/fin, la caché original archivada y el consumo concurrente detallado de la corrida original: **no disponibles**. No se inventaron.

## Protocolo y entorno de la comparación

Una corrida completa por árbol, secuenciales: main primero, combinación actual después. Mismos paquetes instalados, locks y configuración; semilla nueva explícita `367423426`, `--runInBand`, JSON de resultados, caché independiente nueva y secuenciador que conserva el orden observado del log. Main carece de las dos suites nuevas de Insights: sus 203 suites mantienen el mismo orden relativo. La comparación de configuraciones resueltas no encontró diferencias salvo identidad/ubicaciones del worktree y caché.

Entorno verificado ahora: Windows, Node 22.18.0, npm 11.5.2, Jest 29.7.0, jest-expo 57.0.5, React/Test Renderer 19.2.3, React Native 0.86.3, RNTL 13.3.3, Reanimated 4.5.1, TypeScript 6.0.3. Configuración: preset jest-expo, entorno React Native, runner jest-circus, `clearMocks: true`, `resetMocks: false`, `restoreMocks: false`; setup de Gesture Handler y `jest.setup.js`. Los tests existentes restauran explícitamente temporizadores/mocks donde corresponde. No se supone que eso descarte una fuga intermitente.

Locks sin diferencias entre los árboles: Mobile SHA256 `29C368971132810E488B7E8D9B5310A44EFF750720EDDE1405A0228351C11C1B`; raíz `6EDFBCE9ACF5B952A7F917597F9820C0152650D9ED5340847844E5C2FA6FC90B`. Las versiones anteriores son observaciones del diagnóstico; no se presentan como telemetría archivada de cada paquete en la corrida original.

No se iniciaron campañas ni tareas pesadas paralelas a las corridas Jest. Se inventariaron y muestrearon los procesos Node previos sin detenerlos; las muestras fueron estables o con variaciones mínimas. Eso no prueba que el host estuviera libre de toda actividad ajena. Los logs completos y configuración resuelta quedan localmente bajo `%TEMP%/ownlevel-dock-20261107-1829/`; la evidencia compacta versionada acompaña este informe.

Límite fijado antes de mirar los resultados nuevos: una pareja completa y hasta cuatro diagnósticos dirigidos. Si no se reproduce, detener; no recalibrar, modificar el producto o repetir hasta obtener aprobación. La corrida del prefijo original y la instrumentación de handles son comprobaciones distintas, no nuevos intentos completos.

## Resultados y conclusión

**Sin causa acreditada. No se reprodujo el fallo nuevo; no se afirma reparación ni que sea preexistente.** No se alteraron las fuentes de producto ni las pruebas (harness de los casos, expectativas, temporizadores, mocks, timeouts), ni dependencias. La orquestación controlada usa el secuenciador externo declarado. #423–#426 permanecen intactos.

| Ejecución | Árbol | Suites / pruebas aprobadas | Duración Jest |
|---|---|---|---|
| Completa controlada main | `6d94f31` | 203 / 1.683 | 235,857 s |
| Completa controlada combinación actual | `b588af5` | 205 / 1.700 | 236,771 s |
| Prefijo observado hasta el dock, SHA original | `654a0c9` | 18 / 377 | 100,194 s |
| Dock, puente y store con `--detectOpenHandles` | `b588af5` | 3 / 69 | 38,859 s |

Todas terminaron con exit 0, sin pruebas omitidas, fallidas ni errores de runtime. El JSON confirma el orden previsto y el caso del dock aprobado en las cuatro. Solo la última habilita detección de handles: reportó cero. Un resultado sin handles detectados no descarta promesas puramente pendientes, fugas no instrumentadas o una carrera rara.

Tipos, lint y config check aprobados en ambos árboles. **Hay una validación Mobile completa controlada verde** de los cuatro componentes; Jest usa el secuenciador/semilla explícitos de este informe. No se presenta como otra ejecución del comando estándar `npm run validate`, ni como reproducción de la caché o semilla originales. La corrida fallida sigue siendo evidencia válida y su causa permanece abierta. La diferencia 1.700 frente a 1.699 proviene de la regresión temporal adicional ya presente en el head actual de #424.

Se preservaron las advertencias de `act` de las suites en los logs, sin `--silent`. Aparecen también en corridas aprobadas: no bastan para atribuirles el fallo. No se eliminaron advertencias para fabricar aprobación.

Lo que la evidencia permite distinguir:

- No hubo discrepancias de heads, locks, versiones instaladas o configuración entre **las dos corridas controladas**, salvo ubicaciones/identidad. No se puede extender esa afirmación a una caché original no archivada.
- No aparece en el log original un timeout global, rechazo asíncrono no manejado o proceso bloqueado como causa del fracaso informado. Falló la expectativa de desaparición en `waitFor`; la traza no revela el estado interno de presencia ni el conteo final de lecturas.
- Las fuentes del dock, store, provider, caché y configuración de Jest son idénticas entre main y la combinación. Eso no descarta una interacción indirecta ni convierte la diferencia de resultado anterior en un fallo demostrado de main.
- No se observó fallo dependiente del orden recuperado, tampoco en el SHA original con todos sus predecesores. No se acredita ausencia de toda dependencia de orden; no hay una traza de tareas/microtareas original.
- Las pruebas relacionadas cubren lecturas únicas, revalidación tras escritura, respuesta obsoleta, cuenta distinta, recuperación, foreground y limpieza de listeners. Pasaron; no hay una reproducción concreta que justifique corregir producto o harness por alguna de esas hipótesis.

Se usaron **dos corridas completas y dos dirigidas**, dentro del límite previo de una pareja completa y hasta cuatro dirigidas. No apareció evidencia que justifique consumir más intentos. No se ejecutan más corridas para acumular verdes ni se fabrica una corrección. Para investigar un próximo incidente conviene conservar en el momento el JSON, semilla, orden, caché/identidad del árbol y una traza acotada de lectura, invalidación y publicación; este informe no incorpora nueva instrumentación productiva.

## Reproducción y artefactos

[Evidencia compacta](367-dock-diagnostico-evidencia.json): SHAs completos, versiones, hashes de logs/JSON, orden observado, intervalos de ejecución, resultados y los doce casos del dock. Los logs completos permanecen en el directorio local indicado. No se versionan megabytes de salida ni registros personales.

Comandos desde `apps/mobile` (las rutas de artefactos son propias de esta tarea):

```powershell
$artifact = Join-Path $env:TEMP 'ownlevel-dock-20261107-1829'
# En cada worktree; $case fue main o combination, con directorios distintos.
npm test -- --testSequencer="$artifact/observed-order.cjs" --cacheDirectory="$artifact/$case-cache" --seed=367423426 --showSeed --json --outputFile="$artifact/$case-full.json"
npm run typecheck
npm run lint
npm run config:check

# En 654a0c9, todos los archivos que precedían al dock, incluido el propio.
$prefix = @(Get-Content "$artifact/observed-suite-order.json" -Raw | ConvertFrom-Json | Select-Object -First 18)
node ./node_modules/jest/bin/jest.js --runInBand --runTestsByPath $prefix --testSequencer="$artifact/observed-order.cjs" --cacheDirectory="$artifact/original-prefix-cache" --seed=367423426 --showSeed --json --outputFile="$artifact/original-prefix.json"

# En b588af5.
npm test -- --runTestsByPath src/training/active-session-bridge-screen.test.tsx src/training/session-return-dock.test.tsx src/training/session-presence-store.test.ts --testSequencer="$artifact/observed-order.cjs" --cacheDirectory="$artifact/related-handles-cache" --seed=367423426 --showSeed --detectOpenHandles --json --outputFile="$artifact/related-handles.json"
```

El primer lanzamiento del prefijo con el wrapper npm devolvió `Unknown command: "pm"` antes de iniciar Jest. Se conserva como fallo de launcher separado; no es una reproducción ni un resultado de pruebas. La ejecución efectiva del prefijo usó directamente el entrypoint de Jest instalado, con `--runInBand` y los mismos flags.

El secuenciador diagnóstico es externo al repositorio, deriva de `@jest/test-sequencer`, y ordena por el índice de cada ruta relativa en los 205 informes observados. No modifica el orden de casos dentro de una suite. Para recrearlo fuera de esta PC, copiar `observedReportOrder` del JSON a `observed-suite-order.json` y usar:

```javascript
const Sequencer = require(require.resolve('@jest/test-sequencer', { paths: [process.cwd()] })).default;
const order = require('./observed-suite-order.json');
const rank = new Map(order.map((name, i) => [name, i]));
module.exports = class extends Sequencer {
  sort(tests) {
    const relative = t => t.path.slice(t.context.config.rootDir.length + 1).replaceAll('\\', '/');
    return [...tests].sort((a, b) =>
      (rank.get(relative(a)) ?? Infinity) - (rank.get(relative(b)) ?? Infinity) || relative(a).localeCompare(relative(b)));
  }
};
```

## Decisión que permite tomar

No hay una reparación del dock para integrar ni una regresión atribuida a #423–#426. Se puede revisar la integración con evidencia completa controlada verde y con el riesgo intermitente explícito; el resultado no garantiza que el incidente no vuelva.

Orden técnico: #423 → #424; #425 y #426 son independientes sobre main. Este informe tiene base main y no copia sus implementaciones. Previews bloqueadas antes de publicar la rama de diagnóstico. No se aprueba QA física, no se cierran issues y no se reabre #420 ni investigación estadística. La decisión de integración sigue siendo del dueño/revisor; no se hicieron merges remotos ni despliegues.
