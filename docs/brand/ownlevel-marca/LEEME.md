# OWNLEVEL · paquete de marca

Logo 60 A (L baja) · grafito + champagne · SF Pro en la interfaz, Hanken Grotesk solo en el logotipo (acá ya está pasado a curvas, no hace falta la fuente).

## logo/
- `isotipo-*` y `logo-horizontal-*` / `logo-vertical-*`, en SVG y PNG (`png/`).
- `oscuro` = para fondo oscuro (blanco + champagne #C9B68A). `claro` = para fondo claro (#18181B + #7D6A3C).
- `mono-blanco` / `mono-negro` = un solo color, para fotos, sellos o donde el champagne no se vea.
- Los PNG tienen fondo transparente.

## app-icon/ios/
- `icon-1024.png`: ícono principal, sin transparencia (lo que pide Apple).
- `icon-1024-dark.png`: variante oscura de iOS 18+ (fondo transparente).
- `icon-1024-tinted.png`: variante "teñida" de iOS 18+ (escala de grises).
- `icon-composer/`: capas para armar el ícono de vidrio de iOS 26 en Icon Composer.
  Capa 1 = O y palo de la L (#F4F4F5). Capa 2 = pie de la L (#C9B68A).
  Fondo en Icon Composer: degradado de #26262A (arriba) a #09090B (abajo).
  Sugerencia: a la capa 2 darle un poco más de "specular" para que el pie champagne brille apenas más.

## app-icon/android/
- `adaptive-foreground.png` (dentro de la zona segura) + color de fondo `#09090B`.
- `adaptive-monochrome.png`: para los íconos temáticos de Android 13+.
- `play-store-512.png`: para la ficha de Google Play.

## web/
- `favicon.ico`, `favicon.svg`, `favicon-16/32/48.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.

## splash/
- Isotipo para la pantalla de carga, oscuro y claro. Sirve para las opciones A (solo isotipo) y C (cambiando el color de fondo).
  Para la opción B usar `logo/png/logo-vertical-*.png`.

## tema/
- `tokens.ts`: fuente única de los valores. Llega al código a través de `packages/brand` (en Mobile, por `@/design-system`); nunca se copian valores ni se importa desde `docs/`.
- `theme.ts` (Expo), `haptics.ts` (vibración) y `theme.css` (Tailwind v4): adaptadores de referencia. Mobile ya tiene los suyos en `apps/mobile/src/design-system` y `src/platform/haptics.ts`; la Web los adopta en M9.4.
- Todas las decisiones explicadas: `IDENTIDAD.md`.

## Expo · app.json (fragmento)
```json
{
  "expo": {
    "userInterfaceStyle": "automatic",
    "ios": {
      "icon": {
        "light": "./assets/app-icon/ios/icon-1024.png",
        "dark": "./assets/app-icon/ios/icon-1024-dark.png",
        "tinted": "./assets/app-icon/ios/icon-1024-tinted.png"
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/app-icon/android/adaptive-foreground.png",
        "monochromeImage": "./assets/app-icon/android/adaptive-monochrome.png",
        "backgroundColor": "#09090B"
      }
    },
    "plugins": [
      ["expo-splash-screen", {
        "image": "./assets/splash/splash-isotipo-oscuro.png",
        "imageWidth": 96,
        "backgroundColor": "#09090B",
        "dark": { "image": "./assets/splash/splash-isotipo-oscuro.png", "backgroundColor": "#09090B" }
      }]
    ]
  }
}
```
Si la app arranca siempre en oscuro, dejá el splash oscuro también para modo claro (como arriba). Si querés que respete el modo claro, cambiá el `image`/`backgroundColor` principal por `splash-isotipo-claro.png` y `#F3F1EC`.
Ojo: si usás el ícono de Icon Composer (`.icon`), en `ios.icon` va la ruta a ese archivo en vez de los PNG.

## Web · manifest.webmanifest (fragmento)
```json
{
  "name": "OWNLEVEL",
  "short_name": "OWNLEVEL",
  "background_color": "#09090B",
  "theme_color": "#09090B",
  "display": "standalone",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
