# Baseline de lecturas de OWNLEVEL Mobile (#303 · C1)

Herramienta de **desarrollo** para contar y medir las lecturas del cliente antes de cualquier optimización (etapa C2+).
No cambia la app: procesa la telemetría que ya existe en builds de desarrollo (`__DEV__`).

- `[OWNLEVEL API]` (`apps/mobile/src/api/client.ts`): un evento por **solicitud lógica** del cliente.
- `[OWNLEVEL Read Reuse]` (`apps/mobile/src/api/confirmed-read-cache.ts`): decisiones de la caché de lecturas confirmadas
  (`reuse`, `network`, `join`, `settled`, `invalidate`, `evict`).

> **Lógica no es física.** Dos llamadas que `InFlightGet` une en un solo transporte producen **dos** eventos API. Las
> solicitudes físicas de red **no se miden** con estos logs: el reporte lo dice siempre («No medido»). Para medirlas hace
> falta un proxy de red o los logs del servidor, fuera de este alcance.

## Privacidad (obligatorio)

- **La captura cruda nunca entra al repositorio.** Guardala fuera (por ejemplo `/tmp/ownlevel-perf/`) y borrala al
  terminar. El script se niega a leer un archivo que esté dentro del repo.
- **Solo se guardan resúmenes.** `summarize` conserva únicamente método, **plantilla** de ruta, resultado, duración del
  cliente y las decisiones de caché (familia, evento, disparador). Descarta rutas reales, ids, fechas, versiones, build,
  código HTTP, cuerpos, tokens y cualquier campo no previsto.
- **Rutas por lista permitida.** Las plantillas salen del árbol real `src/app/api/mobile/v1/**/route.ts` (`[id]` →
  `:id`). Una ruta que no calza exactamente queda como `<ruta no reconocida>`; nunca se copia el valor original.
  (`safeTelemetryPath()` del cliente solo quita la query: por eso la plantilla se resuelve acá.)
- **Cuenta ficticia, datos sintéticos.** Nunca una cuenta real. Ver «Entorno» abajo.

## Entorno

1. Build de **desarrollo** de la app (Expo dev client) en un **simulador identificado** (modelo e iOS anotados en el
   reporte). No Release, no iPhone físico para esta baseline.
2. `EXPO_PUBLIC_OWNLEVEL_API_URL` apuntando a un backend que **no sea producción**. Si el único backend disponible es
   producción, crear la cuenta ficticia allí requiere autorización expresa de Dirección antes de empezar.
3. Cuenta ficticia con datos sintéticos fijos (los mismos en todas las corridas): por ejemplo 2 rutinas, 6 sesiones en
   las últimas dos semanas, 20 comidas guardadas, peso en 5 días, 3 métricas diarias. Anotar el conjunto usado.
4. Red del simulador sin limitación artificial; anotar si es Wi-Fi o cable.

## Captura

Una captura por **escenario y corrida**. Cualquiera de estas dos fuentes sirve:

- **Terminal de Expo/Metro** (reenvía `console.info` del dispositivo):
  `npx expo start --dev-client 2>&1 | tee /tmp/ownlevel-perf/raw-all.log`, y copiar a un archivo por corrida solo el
  tramo de esa corrida (`/tmp/ownlevel-perf/<escenario>-<n>.log`).
- **Log del simulador** (arranque y fin limpios por corrida):
  `xcrun simctl spawn booted log stream --style compact --predicate 'eventMessage CONTAINS "[OWNLEVEL"' > /tmp/ownlevel-perf/<escenario>-<n>.log`
  y cortar con Ctrl-C al terminar.

El parser tolera colores ANSI, prefijos `LOG`/`INFO`/`(NOBRIDGE)` y objetos en varias líneas, en formato JSON o en el
formato de consola de JS (`{ key: 'value' }`). **Si un resumen informa eventos ilegibles o rechazados, detenete**: el
formato real no se procesa de forma fiable y hay que ajustar el parser antes de seguir, nunca completar a mano.

## Escenarios (3 corridas cada uno)

| Id | Procedimiento |
|---|---|
| `cold-start` | App cerrada por completo → abrir → esperar Inicio completo (sin esqueletos) → fin. |
| `tabs` | Desde Inicio estable: Nutrición → Entrenar → Progreso → Ajustes → Inicio, esperando datos en cada una. |
| `return-under-30s` | En Nutrición estable → Inicio → volver a Nutrición antes de 30 s. |
| `return-over-30s` | Igual, volviendo después de 35 s (cronometrado). |
| `foreground` | En Inicio estable → app a segundo plano 10 s → volver. |
| `date-change` | En Nutrición: día anterior → siguiente → hoy. |
| `write-meal` | En Nutrición: agregar una comida rápida sintética y esperar la confirmación. Borrarla después **fuera** de la captura. |
| `write-metric` | En Inicio: sumar una métrica (por ejemplo agua) y esperar la confirmación. Deshacerla fuera de la captura. |

Entre corridas: mismo punto de partida (para `cold-start`, matar la app; para los demás, esperar 60 s en Inicio).

## Comandos

```bash
# Resumen de una corrida (solo agregados; seguro de guardar):
node scripts/perf-baseline/perf-baseline.mjs summarize --scenario tabs --run 1 --input /tmp/ownlevel-perf/tabs-1.log > /tmp/ownlevel-perf/tabs-1.json
# o desde la entrada estándar:
node scripts/perf-baseline/perf-baseline.mjs summarize --scenario tabs --run 1 < /tmp/ownlevel-perf/tabs-1.log > /tmp/ownlevel-perf/tabs-1.json

# Reporte de todas las corridas:
node scripts/perf-baseline/perf-baseline.mjs report /tmp/ownlevel-perf/*.json > /tmp/ownlevel-perf/baseline.md

# Pruebas del procesador (sintéticas):
node --test scripts/perf-baseline/perf-baseline-core.test.mjs
```

## Qué contiene el reporte

Por escenario: corridas y entorno; por método y plantilla de ruta, las llamadas de cada corrida, mínimo–máximo, errores
(todo resultado distinto de `ok`), tamaño de muestra y p50/p95 de la duración del cliente. p50 exige n ≥ 5 y p95
n ≥ 20; con menos, la celda dice `n<5` / `n<20`. Por familia de caché: reuse, network, join, settled, invalidate, evict
y p50 de `settled`.

## Limitaciones

- Build de desarrollo: más lenta que Release y con logs; sirve para **comparar antes/después en el mismo entorno**, no
  como cifra de producción.
- No mide solicitudes físicas, tiempo hasta datos visibles, memoria ni costo en Supabase/Vercel.
- Metro puede perder líneas con mucho volumen: subestima llamadas. El reporte informa ilegibles y rechazados.
- La duración es la del cliente (fetch más lectura del cuerpo), con la red del simulador.
- El parser se probó con salidas **sintéticas** que imitan Expo/Metro y la consola de JS. El formato real se verifica
  en la primera captura (sin eventos ilegibles) antes de dar por buena la baseline.
