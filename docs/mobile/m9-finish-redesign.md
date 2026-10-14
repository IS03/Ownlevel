# M9 · Finalizar entrenamiento

Implementación F1–F5 de `bocetos/finalizar/`. Identidad: [marca](../brand/ownlevel-marca/IDENTIDAD.md). La sesión en curso conserva el controlador de M3.3: no cambian autosave, CAS, cancelación, reintentos ni claves de idempotencia.

## EXPAND → ADOPT

Se agrega `GET /api/mobile/v1/training/sessions/{id}/highlights`, autenticado por Bearer, sin parámetros de consulta. Solo devuelve sesiones propias completadas; ausentes, ajenas, en curso y descartadas usan el 404 existente. No requiere migración ni service-role. Mobile adopta esta lectura después de confirmar la finalización.

Contrato estricto: `{ sessionId, volumeKg: number | null, highlights }`. Cada destacado contiene `kind`, `exerciseId`, `name`, `mark: { weightKg, reps }`, `weightMode` y `previous`. `sessionId` vincula la respuesta a la sesión solicitada. No se modifica `SessionFinishedDto` ni el ledger: los replays antiguos siguen siendo válidos.

El volumen suma peso × reps de series completadas con ambos valores, únicamente en los cuatro modos explícitos en kg. No duplica valores por mancuerna/brazo. Cero registrado sigue siendo cero; modo nulo/desconocido, tiempo, peso corporal y lingotes no producen kg supuestos.

Los destacados usan historial completo paginado, propio, completado y anterior al cierre actual, con el mismo modo de peso. Reutilizan `buildExercisePerformance`: récord de carga estrictamente mayor que la mejor carga previa; igualdad de carga con más reps puede ser mejora contra la sesión anterior, pero no otro récord de carga. La primera aparición no es récord. Si la última aparición no tiene marca comparable, no se salta a otra más vieja para inventar una mejora. Los lingotes conservan su unidad en la marca; nunca suman kg. No se informan retrocesos.

F4 aparece únicamente con el recibo confirmado. La lectura auxiliar nunca bloquea el resultado: tarda → aparece después; falla → se omite la sección sin afirmar que esté vacía. Máximo cuatro filas: récords, mejoras y adiciones confirmadas a la rutina.

## Decisiones de presentación

- El control nativo vive en el módulo Expo local `ownlevel-finish-controls`. UIKit conserva el comportamiento y apariencia Liquid Glass del sistema, agrega el número en el pulgar y permite deseleccionar el segmentado. La versión instalada de `@expo/ui` no expone un pulgar numerado ni un evento al tocar nuevamente el segmento elegido. Requiere reconstruir el development client; en clientes anteriores, Android y Reducir transparencia se usa el fallback de marca.
- El slider mueve pulgar, número y relleno en nativo/UI thread. Solo el valor final de cada gesto cruza a JS. Energía/rendimiento mantienen `null`; Sin dolor alterna `0`/`null` y Quitar conserva una salida accesible explícita.
- La nota se edita localmente en una hoja con KeyboardAvoidingView. X descarta la edición; check actualiza el borrador existente. El contrato de nota de sesión no impone máximo: el contador muestra caracteres, sin importar el límite de 1000 de las notas de ejercicio ni truncar texto existente.
- La animación solo observa el estado confirmado del controlador. No altera red ni recuperación; con respuesta ambigua vuelve al botón y al aviso actual. Reducir movimiento usa fundidos y cifras finales, sin expansión ni conteo.
- La celebración usa la paleta hero clara de la marca tanto en claro como en oscuro, con texto `onHero`; la hoja de entrada sigue el tema de la app. El texto grande puede apilar estadísticas y desplazar contenido; el pie permanece visible.

## Validación

- `apps/mobile`: `npm run validate`: 128 suites, 969 tests; tipos, lint y configuración correctos.
- Raíz: `tsc --noEmit`, eslint de archivos tocados, y 397 tests de `src/lib/mobile-api` correctos.
- Build nativo de Simulator correcto, incluido el módulo local.
- Evidencia de Simulator y límites de QA: ver la descripción del PR.

## OBSERVE / CONTRACT

Tras desplegar el endpoint, observar errores y duración de la lectura sin payloads privados. F4 debe seguir funcionando si el servidor anterior todavía no publica la ruta. No hay CONTRACT ni retiro de respuestas anteriores en este cambio. No se modifica Web ni el historial general.

QA interrumpido por bloqueo del Mac: F5 y F1 nativos comprobados en claro; serie en kg explícito mostró 50 kg y el ejercicio heredado sin modo no se incluyó. Quedó una sesión libre de prueba en curso (14 oct, inicio 18:27), con `CRUNCH CON DISCO` y `QA FINALIZAR M9`. Al recuperar el Simulator, terminar QA de F2/F3/F4, oscuro/accesibilidad, récord y descartar las sesiones de prueba; archivar el ejercicio temporal. Esta interrupción no se presenta como QA aprobado.
