# OWNLEVEL Mobile: reproducibilidad iOS y QA nativo

El proyecto Expo de `apps/mobile/ios` es generado y permanece ignorado. El `ios/` de la raíz es el cliente Capacitor legado; no interviene en este procedimiento.

## Reconstrucción controlada

En un clon limpio, con `apps/mobile/ios` ausente:

```bash
cd apps/mobile
npm ci
npm run ios:prepare-locked
```

`npm ci` toma `apps/mobile/package-lock.json` y aplica los dos parches mediante `patch-package --error-on-fail`. El segundo comando comprueba las versiones de Node, npm, Xcode y CocoaPods de `apps/mobile/native-lock/toolchain.json`, confirma que ambos parches están aplicados, genera iOS con Expo y ejecuta `pod install --deployment` con `apps/mobile/native-lock/Podfile.lock`. Falla si CocoaPods intenta cambiar el lock. No borra ni sobrescribe un proyecto iOS existente.

El lock versionado es una captura del proyecto regenerado en esta base. El lock anterior del clon tenía un checksum de `ExpoModulesCore` distinto; una regeneración limpia lo actualizó y dos instalaciones posteriores, incluida una nueva regeneración con `--deployment`, conservaron el nuevo checksum. Al cambiar Expo, módulos nativos o herramientas, regenerar y revisar el diff del lock como parte de un PR propio. La versión exacta de Xcode/CocoaPods es una base comprobada, no una promesa de compatibilidad con otras versiones.

La compilación y la firma siguen siendo comprobaciones separadas. Usar el workspace generado (`apps/mobile/ios/OWNLEVELDev.xcworkspace`) para compilar; `pod install` por sí solo no demuestra que Swift/Objective-C enlacen ni que un iPhone acepte la firma. No lanzar una segunda compilación si otra está en curso.

## Parches y navegación

- `expo-router+57.0.22.patch` elimina el `key` de `NativeTabsView` derivado de las pestañas visibles. Evita desmontar todo el navegador cuando aparece/desaparece la quinta pestaña. Cambiar Expo Router exige repetir QA de estado y retorno a sesión; el parche puede dejar de aplicar aunque `npm ci` lo detecte.
- `react-native-screens+4.26.2.patch` adapta el host de tabs a `UITab` en iOS 27 para la pestaña circular prominente, reutiliza los controladores existentes y conserva selección/accesibilidad. En iOS anterior conserva la ruta de `viewControllers`. Es código UIKit interno de una dependencia: cualquier actualización de Screens/Xcode exige compilar y probar ambas rutas. No retirar el parche sin demostrar la misma Tab Bar y navegación.
- El módulo local `modules/ownlevel-page-control` forma parte del autolinking de Expo. Su presencia en `Podfile.lock` es una comprobación de integración, no sustituye una build.

Las pruebas actuales cubren presencia de sesión ante lecturas no disponibles, respuestas obsoletas, montaje/desmontaje, temporizador, cambio de cuenta, retorno desde otras pestañas y visibilidad de la quinta pestaña (`session-presence-store.test.ts`, `session-return-dock.test.tsx`). Estas pruebas usan mocks de tabs y no validan UIKit. El script de Expo Dev Launcher con dependencias ambiguas puede ejecutarse en cada build; mientras la build termina sin error y no se observa un costo material, es una advertencia de rendimiento menor del pod generado.

## Matriz pendiente para iPhone físico

| Escenario | Resultado esperado |
| --- | --- |
| Instalar/actualizar el development build firmado, sin borrar la app | La app abre y SecureStore lee la sesión existente o muestra login si nunca hubo sesión. |
| Login OAuth y retorno warm/cold | Callback `ownlevel-dev://auth/callback`; sesión persiste tras cerrar y reabrir la app. |
| Bloquear/desbloquear el iPhone y volver del background | Keychain disponible al desbloquear; no aparece `A required entitlement is not present`; auto-refresh se recupera. |
| Red ausente durante restore y vuelta de la red | Una falla transitoria conserva la sesión local; no muestra un falso cierre de sesión. |
| Entrenamiento activo: cambiar entre las cuatro secciones, usar quinta pestaña y volver | Se conserva la sesión y el descanso; no vuelve involuntariamente al hub. |
| Finalizar sesión y volver; cambiar de cuenta | La quinta pestaña desaparece cuando corresponde; el temporizador anterior no se filtra a la cuenta nueva. |

La firma, los entitlements efectivos y Keychain en dispositivo sólo quedan confirmados tras estas pruebas en iPhone. No desinstalar la app ni limpiar sus datos para hacerlas.
