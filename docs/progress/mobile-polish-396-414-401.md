# Tanda Mobile — #396, #414 y #401

Base fijada: `4859c017dafe7d640eeb4c807c388582363d6650` (#420). Tres PRs borrador independientes, sin merges remotos, despliegues, instalaciones o builds. Ningún cambio de Web, #402, #348, backend, persistencia o metodología de Insights.

## Plan ejecutado

1. #396: clasificar lectura/copia local en cabecera sin esconder las recuperaciones importantes. Mantener intacto el controlador protegido de sesión.
2. #414: reemplazar el modo contexto legacy por la hoja compartida desplazable de la fecha, sin modificar cálculos, CAS ni journal; conservar el cierre previo de Tu día.
3. #401: confirmación secundaria de métricas, gesto y alternativa accesible, con Deshacer seguro y una política explícita de avisos consecutivos. Mantener errores fuera de esa presentación de éxito.
4. Pruebas dirigidas, tipos/lint por etapa y una sola validación Mobile completa combinada. Investigar cualquier fallo sin repetir para aprobar.

## Entregas revisables

| Issue / PR | Commit de implementación | Evidencia dirigida |
|---|---|---|
| #396 / #428 | `e22259bc132df22ce5adb8f834ada9c83df031c2` | 112 pruebas únicas, tipos y lint aprobados |
| #414 / #429 | `0de199bc67e3df46b1cdd61b7feaa6e7fac8a1be` | 67 pruebas únicas, tipos y lint aprobados |
| #401 / #430 | `83e8f52d8056de134026184186130686256b4d54` | 65 pruebas únicas, tipos y lint aprobados |

Detalles de decisiones y límites: [sesión](396-session-status.md), [ajustes de fecha](414-daily-context.md), [confirmaciones](401-metric-confirmation.md). Los conteos por entrega no deben sumarse como pruebas únicas de la combinación, porque comparten suites. El commit posterior de #430 agrega solo este checkpoint.

Combinación local no publicada: `552dc723c4363733350920b91a15c64ab1903268`, sobre #430 aplicando #428 y #429. Solo hubo conflictos en `vercel.json` y la checklist: se conservaron las tres claves de bloqueo de previews y las tres entradas de QA. No hubo conflictos de producto. La instrumentación diagnóstica posterior se retiró íntegramente; no modifica las entregas.

## Validación completa — gate NO aprobado

Una ejecución de `npm run validate` desde `apps/mobile`, en la combinación indicada:

- Tipos y lint: aprobados.
- Jest: **205 suites aprobadas y 1 fallida, de 206; 1.718 pruebas aprobadas y 1 fallida, de 1.719**. Duración: 197,745 s.
- Falló `session-return-dock.test.tsx`, «reads presence once across five quick route changes, and revalidates after a settled write», línea 193: esperaba `null` al buscar `session-return-dock`; recibió un `View` de React Test Renderer. La expectativa del conteo de lecturas posterior no llegó a verificarse.
- La cadena se detuvo en Jest. `npm run config:check` se ejecutó después por separado y aprobó.
- Log completo conservado en `%TEMP%/ownlevel-polish396-414-401-validate.log`. No se reejecutó la suite completa para obtener verde.

### Investigación acotada del fallo

No se atribuye a main ni a la tanda. El test, store, provider y caché de presencia no cambiaron entre main y la combinación.

1. En main `4859c01`, las suites de dock, store y puente (`npm test -- --runTestsByPath ...`) pasan **69/69**, 16,796 s. Log: `%TEMP%/ownlevel-polish-main-dock.log`. Esto no demuestra preexistencia ni explica el fallo amplio.
2. En la combinación se ejecutaron los **17 archivos del prefijo observado hasta el dock**, en ese orden, con una sonda temporal que conserva expectativas, mocks y timeouts. Pasan **357/357**, 67,137 s; semilla registrada `1834476520`. Artefactos bajo `%TEMP%/ownlevel-polish-dock/`: orden, secuenciador, patch diagnóstico, log y JSON.
3. La traza aprobada muestra: antes de escribir, una lectura y revisión 0; tras invalidar, ambas revisiones observadas pasan a 1; al cambiar ruta hay segunda lectura en vuelo; al terminar hay dos lecturas, ausencia confirmada y ninguna sesión visible. El callback de timeout no se ejecutó en esa reducción.

**Sin causa acreditada.** El fallo sí volvió a observarse en la corrida amplia; la reducción no lo reprodujo. La sonda y el secuenciador modifican las condiciones diagnósticas, no acreditan ausencia de una carrera intermitente. La semilla de la corrida completa no quedó registrada. No se fabricó un arreglo del dock ni se tocaron expectativas, timeouts o producto para convertir el resultado en aprobación. Límite de esta tanda: una completa y esos dos contrastes dirigidos; no se inicia otra investigación ni funcionalidad.

## Alcance de la verificación visual

Se usó el renderer de React Native y el puente JS de Gesture Handler con datos sintéticos, estados retenidos, claro/oscuro, ancho sintético, texto sin truncar y acciones de accesibilidad. Eso verifica composición/estado y callbacks; **no** ejecuta UIKit ni prueba reconocimiento físico del gesto, teclado, VoiceOver o geometría real. No hay simulador iOS disponible en este Windows; no se instalaron herramientas. Los mocks nativos existentes no se alteraron para afirmar ejecución física.

La [checklist única](367-qa-fisica.md) sigue sin aprobar. Los tres issues permanecen abiertos. Orden sugerido de revisión: #428 → #429 → #430; no hay dependencia funcional, pero al integrar se deben conservar todas las entradas comunes de previews/QA. Quedan pendientes el gate global del dock y la aceptación visual/física autorizada. No se hicieron merges remotos ni cambios de producción.
