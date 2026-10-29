# Historial: lecturas duplicadas y bucle del calendario · distribución y medición

Primera intervención sobre el consumo de Fluid Active CPU. Solo cambia el cliente Mobile: el servidor, la Mobile API, Supabase y el proxy quedan igual.

## Qué cambia

| Antes (`main` `5348b63`) | Después (`codex/mobile-get-dedup`) |
|---|---|
| Abrir Historial: 2 GET de `/training/history` + meses del calendario | 1 GET de `/training/history` + meses del calendario |
| Pull-to-refresh: el calendario relee sus meses en bucle (>1000 GET en la prueba con mocks) | 1 GET de sesiones + 1 por mes visible, una sola vez |
| Dos pantallas que piden el mismo GET a la vez: dos solicitudes de red | Una solicitud compartida; cada pantalla puede cancelar la suya |

Las escrituras nunca se comparten ni se reintentan. Una escritura confirmada hace que la siguiente lectura vaya a la red.

Archivos: `api/client.ts`, `api/in-flight-get.ts`, `training/use-read.ts`, `training/history-screen.tsx` y sus pruebas.

### También incluye: salto al abrir un ejercicio después de reordenar

Después de un reorden confirmado, `NativeReorderList` conserva el orden nativo de montaje y compensa con `translateY`. Al abrir o cerrar una tarjeta cambia su altura, y con ella esa compensación. Ese cambio se animaba con el mismo resorte del arrastre, así que la tarjeta de al lado cruzaba su lugar viejo (sesión activa, Rutinas y editor de rutinas).

Ahora solo se anima un cambio de lugares: arrastre, soltar, revertir u orden nuevo. Un cambio de altura se aplica sin animación, igual que el resto de la lista. No cambia cómo se guarda el orden. Archivo: `training/session-native-interactions.tsx`.

## Validación

- Automática: `npm run validate` en verde (typecheck, lint, Jest y config).
- Simulador: Historial y Calendario aprobados con la API de producción, en modo solo lectura; las escrituras se probaron con mocks.
- **QA físico en iPhone: omitido por decisión del usuario (29/10/2026)**, que acepta el riesgo residual. El salto al reordenar tampoco se vio en pantalla: reordenar exige una sesión activa real. Riesgo residual:
  - comportamiento con red real y lenta;
  - un posible parpadeo de 1–2 cuadros, mientras llega la nueva altura de una tarjeta abierta después de un reorden.

## Cómo llega al iPhone

| Cliente | De dónde sale el JS | Cuándo recibe el fix |
|---|---|---|
| **OWNLEVEL Dev** | Metro (Debug) | Al conectarse a un Metro que sirva la rama o `main` con el merge |
| **OWNLEVEL Diario** (uso diario) | `main.jsbundle` embebido (Release) | **Solo** al recompilar e instalar Diario desde `main` con el merge |
| Web/PWA | Vercel | No cambia: el diff no toca código Web ni servidor |

El merge, por sí solo, **no** cambia la app que usás todos los días. Hasta reinstalar Diario, las solicitudes de producción no bajan.

Pasos después del merge (detalle en [ios-daily-release.md](ios-daily-release.md)). Se ejecutan en el checkout principal, que es el que tiene el proyecto `ios/` y los Pods. Antes, `main` tiene que estar actualizado en ese checkout: revisá `git status` y no cambies de rama con cambios ajenos sin decidir qué hacer con ellos.

```bash
cd apps/mobile
npm run ios:daily -- prepare
npm run ios:daily -- build --device UDID_DEL_IPHONE
npm run ios:daily -- verify --device UDID_DEL_IPHONE
npm run ios:daily -- install --device UDID_DEL_IPHONE
```

- No hace falta prebuild ni `pod install`: la rama no cambia dependencias ni configuración nativa.
- Antes de compilar, `git merge-base --is-ancestor 4ed1f68 HEAD && echo incluido` tiene que imprimir `incluido`: así el build trae el fix.
- `verify` confirma que el bundle embebido se generó en ese build. Anotá fecha y hora de la instalación: es el corte para medir.
- Merge a `main`: Vercel compila un deployment de producción aunque el código servido no cambie (todavía no hay filtro de builds). Consume minutos de build, no Fluid Active CPU.
- Rollback: `git revert -m 1 <merge de la PR>` en `main` y reinstalar Diario con el mismo procedimiento. Antes de abrir la PR se comprobó que el revert sobre esta rama aplica sin conflictos y deja el código igual a `main`. No hay datos, migraciones ni contratos de API que deshacer. Una Development conectada a Metro vuelve a la versión anterior con solo recargar.

## Medición

Límites del plan Hobby, comprobados el 29/10/2026: las consultas de observabilidad por ruta piden Observability Plus (402), y los logs de ejecución se guardan **1 hora**. No se puede reconstruir el pasado por ruta: cada medición se toma en el momento.

### A. Cliente controlado (cuántas solicitudes hace la app)

1. Misma cuenta, mismo iPhone y OWNLEVEL Dev. Primero Metro con `main`, después con la rama.
2. Mismo guion: abrir Historial, 3 pull-to-refresh, abrir/cerrar calendario, 5 cambios de mes, abrir una sesión y volver, 60 s quieto.
3. Contar las líneas `[OWNLEVEL API]` del log de Metro por ruta.
4. Resultado esperado: la rama hace menos solicitudes en el arranque y no tiene bucle tras el refresh. Es la prueba directa del cambio.

### B. Producción por ruta (antes / después de instalar Diario)

En la consola de Vercel, o con la herramienta de logs, mirá la última hora del proyecto `gymapp`, entorno production, agrupada por `requestPath`. Hacelo en una ventana de uso comparable: por ejemplo, la hora de un entrenamiento con Historial abierto.

Base tomada el 29/10/2026 19:28 (ART), en una ventana de 59 minutos con uso real durante un entrenamiento. Son registros de log, no invocaciones exactas:

| Ruta | Registros |
|---|---|
| `/api/mobile/v1/home` | 105 |
| `/api/mobile/v1/training` | 92 |
| `/api/mobile/v1/history/days/{hoy}` | 36 |
| `/api/mobile/v1/training/history` | 34 |
| `/api/mobile/v1/training/sessions/{id}` | 27 |
| `/api/mobile/v1/nutrition/days/{hoy}` | 13 |

Lo que este fix puede mover es `/training/history` y `/training/history/days`. `home` y `training` no dependen de Historial: corresponden a las próximas optimizaciones. No atribuirle a este fix una baja en esas rutas.

### C. Fluid Active CPU e invocaciones (total del proyecto)

1. Vercel → proyecto `gymapp` → **Usage**: anotar por día Fluid Active CPU y Function Invocations de los 7 días previos a instalar Diario.
2. Repetir con los 7 días posteriores, con un uso parecido (cantidad de entrenamientos).
3. Comparar el promedio diario y el cociente CPU / invocación.
4. Atribuir una baja al fix solo si coincide con lo que muestra B en las rutas de Historial. Un cambio del total sin cambio en esas rutas se explica por otra cosa: más o menos uso, otros deployments o Web.

Sin estos tres pasos no se informa una reducción de CPU.
