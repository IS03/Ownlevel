# iPhone físico: Release local con Personal Team

Objetivo: usar **OWNLEVEL Diario** con JavaScript embebido, Supabase Auth y Mobile API reales, sin depender de Metro. Es una instalación personal con firma de desarrollo gratuita; «Release» describe la compilación, no una distribución App Store/TestFlight.

## Diagnóstico inicial (20/10/2026)

| Elemento | Resultado |
| --- | --- |
| Expo definitivo | `apps/mobile`, SDK 57.0.24, React Native 0.86.3, React 19.2.3. |
| Proyecto Expo generado e ignorado | `apps/mobile/ios/OWNLEVELDev.xcworkspace`; target/scheme `OWNLEVELDev`. Run usa Debug; Archive/Profile usan Release. |
| Identidad anterior | Debug y Release compartían `fit.ownlevel.app.dev`, nombre `OWNLEVEL Dev`, callback `ownlevel-dev://auth/callback`. Una Release directa habría reemplazado Development. |
| Capacitor legado | `ios/App/App.xcodeproj`, bundle ID `fit.ownlevel.app`; `mobile/` es el cliente anterior. Se conservan. |
| Xcode activo | `/Applications/Xcode.app/Contents/Developer`, 27.1 (27A9275). El baseline de `native-lock/toolchain.json` sigue siendo 27.0: no se cambió ni se eludió `ios:prepare-locked`. |
| Firma existente | Certificado Apple Development válido hasta 19/09/2027, team `YKRLTJQJ84`, firma automática. El vencimiento del certificado **no** determina los siete días de cada provisioning profile. Confirmar «Personal Team» en Xcode. |
| Entitlements originales | Diccionario vacío; no se agregan Push, iCloud, Associated Domains ni Sign in with Apple. |
| Perfiles iniciales | No se encontraron perfiles locales en las dos ubicaciones habituales de Xcode. Firma e instalación requieren obtener un perfil válido. |
| Dispositivo inicial | «iPhone de Senes», iPhone16,2, iOS 27.2, registrado pero desconectado. |
| Servicios reales | `.env.local` apunta a `https://www.ownlevel.fit` y al Supabase real con clave publishable. Auth settings respondió 200 con Google habilitado; Home Mobile API respondió 401 sin Bearer. Eso no prueba login ni lecturas autenticadas. |

No se hizo pull, cambio de rama, prebuild, instalación de dependencias ni modificación de base de datos. Los cambios previos en bocetos no forman parte de este trabajo.

## Separación de identidades

| | Development | Diario | Capacitor legado |
| --- | --- | --- | --- |
| Bundle ID | `fit.ownlevel.app.dev` | `fit.ownlevel.app.daily` | `fit.ownlevel.app` |
| Nombre | OWNLEVEL Dev | OWNLEVEL Diario | OWNLEVEL |
| Callback Auth | `ownlevel-dev://auth/callback` | `ownlevel-daily://auth/callback` | Sin cambios |
| Keychain service | `fit.ownlevel.app.dev.auth` | `fit.ownlevel.app.daily.auth` | Sin cambios |
| Workspace | `OWNLEVELDev.xcworkspace` | `OWNLEVELDaily.xcworkspace` | Proyecto raíz |
| Ejecución | Debug + Metro | Release + `main.jsbundle` | Sin cambios |

La variante por defecto sigue siendo Development. No agregar `EXPO_PUBLIC_IOS_VARIANT=daily` al `.env.local` habitual ni exportarla en la terminal que usa Metro. El comando Diario la establece sólo en su proceso y sus hijos; también fija `EXPO_PUBLIC_APP_ENV=production` sin editar archivos de entorno.

`app.json` conserva la base Development. `app.config.js` cambia nombre, scheme y bundle ID iOS sólo para Diario. No se modifica Android. El parser OAuth conserva sus validaciones y deduplicación, aceptando únicamente el scheme de su variante. Persistencia, PKCE, Bearer, API, escrituras y políticas RLS conservan su implementación.

El script genera un **proyecto separado** en `apps/mobile/.expo/ios-daily/native/`: copia la estructura del proyecto Expo existente, cambia únicamente su identidad/firma y usa los mismos fuentes/Pods mediante `projectDirPath` al `ios/` original. Conserva el nombre interno del target `OWNLEVELDev` para no reinstalar CocoaPods. El scheme `OWNLEVELDaily` ejecuta Release sin debugger y su producto es `OWNLEVELDaily.app`. No confundir nombre interno del target con bundle ID.

Archivos generados e ignorados: `.expo/ios-daily/native/OWNLEVELDaily.xcodeproj`, `.expo/ios-daily/native/OWNLEVELDaily.xcworkspace`, plist y marcador. Productos separados en `.expo/ios-daily/device` y `.expo/ios-daily/simulator`. **No agregar otro workspace directamente a `ios/`**: Expo selecciona el primero y podría alterar `npm run ios`. Se verificó que su resolver sigue eligiendo `ios/OWNLEVELDev.xcworkspace`. Un marcador evita sobrescribir rutas ajenas. El script verifica hashes del proyecto, scheme, plist, entitlements y Podfile.lock originales. Los scripts normales de Expo pueden regenerar fuentes auxiliares de Pods al compilar; no ejecutar builds nativas concurrentes.

## Preparación e instalación

Desde el clon actual, con el proyecto Expo y sus Pods ya instalados:

```bash
cd apps/mobile
npm run ios:daily -- prepare
open .expo/ios-daily/native/OWNLEVELDaily.xcworkspace
```

No abrir el proyecto Capacitor raíz ni ejecutar `prebuild --clean`. Si falta el proyecto Expo, detenerse y revisar [ios-reproducibility.md](ios-reproducibility.md) y sus versiones; Diario no regenera ni borra proyectos.

1. Conectar el iPhone por USB, desbloquearlo y aceptar «Confiar» en ambos dispositivos. Activar Developer Mode en Ajustes → Privacidad y seguridad si iOS lo requiere (reinicio y confirmación en el teléfono).
2. En Xcode → Settings → Accounts, iniciar sesión con el Apple Account gratuito. Confirmar que `YKRLTJQJ84` corresponde al **Personal Team** deseado. Si es otro, usar `--team TEAMID` al preparar/compilar.
3. En el workspace Diario, seleccionar el target interno `OWNLEVELDev` → Signing & Capabilities. Confirmar bundle ID **`fit.ownlevel.app.daily`**, firma automática y Personal Team. No editar el workspace Dev. El certificado ya existe; no revocarlo ni reemplazarlo para resolver errores de perfil.
4. Seleccionar scheme **OWNLEVELDaily** y el iPhone físico. Si Xcode solicita soporte del dispositivo/SDK para iOS 27.2, resolverlo antes de instalar. Un destino «unavailable» no es un fallo de JavaScript.
5. En [Supabase → Authentication → URL Configuration](https://supabase.com/dashboard/project/vtxacamtayeqnogxyapd/auth/url-configuration), agregar **exactamente** `ownlevel-daily://auth/callback` a Redirect URLs. Conservar Site URL, callbacks Web y `ownlevel-dev://auth/callback`. No usar un wildcard para resolverlo. Es configuración de Auth, no una migración de tablas. Sin este paso el flujo puede volver a la Web.
6. Mantener en `.env.local` los valores públicos reales. El script exige HTTPS y clave publishable, y el build embebe esos valores. Cambiar el entorno exige recompilar; no alcanza con editar `.env.local` después de instalar.

Consultar el UDID conectado y compilar:

```bash
xcrun devicectl list devices
npm run ios:daily -- build --device TU_UDID
npm run ios:daily -- verify --device TU_UDID
npm run ios:daily -- install --device TU_UDID
```

El build permite a Xcode gestionar el provisioning y registrar el dispositivo. Si necesita interacción de cuenta, abrir el workspace Diario y resolverla en Xcode. No sustituir la firma por `CODE_SIGNING_ALLOWED=NO` para instalar.

`verify` revisa bundle ID, nombre, schemes exclusivos, ausencia de discovery de Development, bundle JS y configuración pública embebidos, firma, identidad firmada, team, perfil gratuito (`LocalProvision`), UDID y expiración. Escanea strings Hermes decodificados para detectar claves secretas completas: el prefijo solo existe legítimamente en el clasificador del SDK y el binario concatena strings. `install` repite estos controles antes de instalar y abrir **sólo** `fit.ownlevel.app.daily`. No hay comando de desinstalación.

Si iOS pide confiar en el desarrollador: Ajustes → General → VPN y gestión de dispositivos → cuenta correspondiente → Confiar. La primera sesión de Diario requiere login propio; no se copia la sesión de Development.

El scheme está en Release y no adjunta debugger, pero abrir Xcode desde Finder no establece el entorno Diario para todos los scripts de Pods. **Usar el comando `build` documentado**; abrir Xcode sirve para cuenta/firma/destino. La fase de bundle del proyecto generado rechaza otra configuración o un entorno sin `EXPO_PUBLIC_IOS_VARIANT=daily`, evitando producir accidentalmente una app Diario con callback Dev. No usar Run como sustituto del comando sin preparar y verificar ese entorno.

## Validación en iPhone (la realiza el usuario)

- Ver ambas apps instaladas, **OWNLEVEL Dev** y **OWNLEVEL Diario**. Confirmar que Dev conserva su sesión y vuelve a conectar a su Metro habitual.
- Abrir Diario desde el ícono sin debugger, con la Mac apagada/desconectada o sin acceso a su red. Mantener Internet por Wi-Fi/celular: «sin Metro» no significa «sin backend».
- Entrar con Google y comprobar retorno a **Diario**, sin abrir Dev ni quedar en Web. Probar cancelación y reintento, sin registrar URLs OAuth ni códigos.
- Cerrar Diario completamente y reabrirlo; bloquear/desbloquear; background/foreground y reapertura después de más de una hora. La sesión debe restaurarse o renovarse.
- Leer Inicio, Entrenar, Nutrición y Progreso con los datos reales esperados. Comparar con Web; no generar sesiones/comidas artificiales para validar. Las escrituras se verifican con uso real deliberado del usuario.
- Cortar Internet y volver a abrir: distinguir no disponible de vacío y no cerrar sesión por una falla transitoria. Recuperar red y reintentar.
- Durante el uso real: conservar entrenamiento activo y descanso al cambiar de pestaña o bloquear. Comprobar la próxima carga real y su reflejo en Web.
- Si se prueba logout, hacerlo en Diario y verificar que Dev y Safari/Web siguen autenticados. No borrar la app para renovar la firma.

Compilar o abrir la pantalla de entrada no alcanza para declarar autenticación, Keychain y lecturas reales verificadas. Registrar qué escenarios se completaron y cuáles quedaron pendientes, sin incluir datos de salud ni tokens.

## Renovación semanal

Apple indica que los perfiles de Personal Team vencen a los **7 días**; permite hasta tres apps instaladas por dispositivo y tres dispositivos registrados. Development y Diario ocupan lugares separados. Ver [límites oficiales](https://developer.apple.com/help/account/basics/about-your-developer-account).

Antes de la fecha que imprime `verify`:

1. Conectar/desbloquear el mismo iPhone y mantener el mismo Apple Account, Team y bundle ID.
2. Ejecutar `build`, `verify` e `install` con su UDID. Confirmar que la expiración impresa cubre la próxima semana: reinstalar un `.app` con el perfil anterior no renueva nada.
3. Si Xcode reutiliza un perfil cercano a vencer, abrir Signing & Capabilities del **proyecto Diario**, resolver el provisioning con la cuenta conectada y recompilar. No revocar certificados/perfiles de otras apps, cambiar de bundle ID ni desinstalar como atajo.
4. Abrir desde el ícono y comprobar restore/una lectura real. La actualización sobre la misma app preserva su contenedor; no se garantiza persistencia si se cambia de team/identidad o se desinstala.

Si ya venció, la app puede dejar de abrir hasta volver a firmar e instalar. Eso no elimina datos de Supabase ni exige modificar la base. Una renovación no necesita Metro; sólo herramientas locales, Internet para Apple y el iPhone conectado.

## Comprobaciones técnicas y recuperación

```bash
# Diagnóstico de compilación para iPhone: NO instalable
npm run ios:daily -- build --unsigned
npm run ios:daily -- verify --unsigned

# Compilar para simulador en productos separados, sin instalar ni tocar el simulador abierto
npm run ios:daily -- build --simulator

# Validación de código/configuración por defecto (Development)
npm run validate
```

- «No profiles»/«No Accounts»: resolver Personal Team y provisioning en Xcode; no usar EAS/ad-hoc/distribution como sustituto gratuito.
- Límite de apps/App IDs: revisar cuáles ocupan cupo; no borrar Development ni Capacitor automáticamente.
- «No bundle URL»/petición de Metro: verificar que el producto sea Diario Release con `main.jsbundle`, y que no se haya instalado Dev por error.
- OAuth abre Dev: comprobar schemes del producto con `verify` y el redirect real; no registrar `ownlevel-dev` en Diario.
- Pantalla sin datos/error de red: comprobar conectividad, host API y sesión; no tratar indisponibilidad como cero ni agregar reintentos de escrituras.
- Cambio de módulos/Pods: actualizar primero el proyecto Expo por el flujo revisado; luego volver a ejecutar `prepare/build`. Diario no ejecuta `pod install` ni cambia el lock.
- Volver al flujo habitual: `npm start` / `npm run ios` siguen usando Development. No cerrar Metro para probar Diario; se puede quitar el cable o apagar la Mac para demostrar independencia.

Referencias: [Expo: variantes simultáneas](https://docs.expo.dev/tutorial/eas/multiple-app-variants/), [Expo: build local Release](https://docs.expo.dev/guides/local-app-production/), [Supabase: deep linking nativo](https://supabase.com/docs/guides/auth/native-mobile-deep-linking), [autenticación existente](native-auth.md).

## Resultado de esta preparación

- Proyecto y workspace Diario generados sin regenerar Expo/Pods. Los hashes del proyecto, scheme, plist, entitlements y Podfile.lock originales se conservaron durante la compilación.
- Compilación **Release arm64 para iPhone sin firma** terminada con Xcode 27.1. Se verificaron `OWNLEVELDaily.app`, bundle ID, schemes, `main.jsbundle` Hermes (~9 MB), hosts y clave publishable reales embebidos. La compilación ejecuta el bundler para producir el archivo; la app resultante no busca su JS en Metro. El proceso Metro Development existente siguió activo.
- Typecheck, lint y config de ambas variantes pasaron. Suite completa: 167/168 suites y 1309/1310 pruebas; un timeout en `nutrition/day-screen.test.tsx`. Repetición de esa suite y OAuth: 25/25 pruebas, incluido el caso nuevo que aísla callbacks Diario/Development. Comprobación posterior de Auth y política de entorno público: 36/36 pruebas.
- **Firma bloqueada:** Xcode devolvió credenciales inválidas de la cuenta guardada (`missing Xcode-Username`), `No Accounts` y ausencia de perfil para `fit.ownlevel.app.daily`. No es un error del certificado existente ni de Supabase. Reautenticar en Xcode → Settings → Accounts y confirmar Personal Team antes de repetir la build firmada. No se revocaron certificados.
- La build final desde `.expo/ios-daily/native/`, incluida la protección del entorno Diario, terminó y pasó `verify --unsigned`. Un segundo intento de firma tras inicializar Xcode volvió a devolver `No Accounts`/perfil ausente. No queda una compilación ejecutándose en segundo plano.
- Redirect `ownlevel-daily://auth/callback` agregado en Supabase, confirmado por el usuario.
- Se intentó resolver la cuenta desde la interfaz: se avanzó la preparación inicial de Xcode sin descargar el runtime opcional de simulador, pero luego la automatización de su ventana agotó el tiempo de respuesta. `xcodebuild -checkFirstLaunchStatus` terminó correctamente. El iPhone siguió desconectado; no se puede sustituir desde la Mac el desbloqueo/conexión física del teléfono ni una verificación personal de Apple.
- **Pendiente:** recuperar cuenta de Xcode, iPhone conectado/desbloqueado, firma gratuita, instalación y QA físico de login/restore/lecturas. No se declara validado el uso diario hasta completar esos pasos. No se instaló ni sobrescribió ninguna app, no se cambió la base de datos y no se hizo commit/push/PR.
