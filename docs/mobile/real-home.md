# Inicio Mobile · M9.3

Estado al 2026-10-14: Entrenos, Nutrición semanal y Hábitos implementados; QA visual/funcional del usuario en Simulator/iPhone pendiente. Fuente visual: `bocetos/inicio/`. Marca: [IDENTIDAD.md](../brand/ownlevel-marca/IDENTIDAD.md) y tokens compartidos.

## Arquitectura y lecturas

Expo usa exclusivamente Mobile API v1 con bearer. Supabase es la fuente de verdad; identidad derivada del token, ownership/RLS y contratos de escritura existentes se conservan. Inicio no consulta tablas directamente.

`home-data.ts` emite lecturas independientes en paralelo: Home, día actual de Historial, comidas rápidas, reporte nutricional desde el lunes hasta hoy, historial de entrenamientos semanal, Hábitos semanal y resúmenes de Cuerpo/Rendimiento. Cada bloque conserva su carga, fallo y última lectura confirmada. Pull-to-refresh y foreground recargan; volver al tab recarga después de 30 segundos o al cambiar de día. Las fechas usan Córdoba, también en el cambio de semana.

## Esta semana

Tres páginas, sin scroll vertical interno, sobre el fondo de Inicio. Comparten un alto fijo según ancho, Dynamic Type y el ejemplo inicial; conservan los puntitos nativos y sus etiquetas Entrenos, Nutrición y Hábitos. Con letra grande se muestran menos filas de Hábitos y el resto sigue accesible desde Métricas.

- **Entrenos:** número, detalle, cápsulas diarias y ejemplo EJEMPLO inicial conservados. Tocar un día abre `/(tabs)/train/history?date=…`.
- **Nutrición:** promedio del servidor de días terminados con datos, cobertura sobre siete días, barras diarias desde cero y macros. Cada segmento de objetivo usa el snapshot de ese día; no se reemplaza por la meta actual. Sin dato es un carril vacío, cero no crea una barra, los días futuros quedan neutros y hoy se marca en curso, fuera del promedio. Tocar abre el reporte de esta semana. Esta presentación quedó aprobada por el usuario el 2026-10-14.
- **Hábitos:** métricas activas en el orden del usuario, íconos compartidos con el registro, promedio y unidad/formato, cobertura sobre siete días y flecha neutra solo para cambios comparables. Hasta tres filas y «y N más» si corresponde. Sin muestras: «—» y «0 de 7 días». Sin métricas activas: explicación neutral y acceso a Métricas. Tocar una fila abre esa métrica en Progreso, con su selector de período existente.

## API aditiva de Hábitos

`GET /api/mobile/v1/progress/habits`, sin parámetros. Usa el mismo autenticador bearer, headers privados/CORS y manejo de errores que Progreso. No altera las respuestas ni los presets existentes.

Respuesta: `today`, `weekStart`, `weekEnd`, `previousWeekStart`, `previousWeekEnd`, `completedDays`, `items`. Cada item incluye `id`, `systemKey`, `name`, `unit`, `valueType`, `average`, `coverage`, `comparison`.

- Semana actual lógica: lunes a domingo, exactamente el lunes de Inicio. Las muestras elegibles son del lunes hasta ayer: hoy en curso y las fechas futuras se excluyen.
- Referencia: lunes a domingo de la semana anterior completa, explícita; nunca los N días inmediatamente anteriores al lunes actual.
- El motor existente calcula promedios de días con dato y comparabilidad. Un cero registrado cuenta. Se mantiene su mínimo de dos muestras por período y su umbral de estabilidad; el cliente no recalcula promedios ni compara porcentajes.
- `coverage.eligible` representa los días terminados; la UI muestra `coverage.registered de 7 días` para situar la cobertura en la semana completa.
- Devuelve **todas** las definiciones activas no archivadas, también sin muestras, sin el filtro ni el límite editorial del overview. Conserva el orden de métricas del servidor.
- Lecturas incompletas o fallidas devuelven 503; nunca una lista vacía de reemplazo. Se valida el DTO antes de responder. Un cruce de medianoche de Córdoba permite una sola relectura con la fecha nueva. Mobile rechaza una respuesta que pertenece a otra semana y no presenta lecturas de otro día como actuales.

Implementación: opción interna `previousRange` del lector de reportes, utilizada solo por esta nueva lectura. Los callers actuales conservan su referencia predeterminada. Reutiliza las tablas, RLS, inicialización idempotente de métricas y paginación existentes; no necesita migraciones ni service role.

Rollout: **EXPAND** desplegar la ruta nueva → **ADOPT** distribuir Mobile → **OBSERVE** errores/latencia con etiquetas sin payload privado. Sin CONTRACT. Hasta que exista la ruta, Hábitos muestra «No pudimos cargar Hábitos de esta semana.»; el resto de Inicio permanece operativo.

## Métricas

Una sola fila horizontal, incluido Más al final. En tamaño normal, el ancho útil se reparte en tres columnas iguales: izquierda, centro y derecha. Los elementos restantes se alcanzan deslizando; Más no tiene una posición fija. El viewport llega al borde derecho, con gutter izquierdo y padding final seguro. Con letra grande, el mínimo de ancho crece para conservar nombres y valores legibles.

Se mantienen el orden del usuario y los estados de hoy: check y valor solo con lectura confirmada, Cargar sin valor confirmado y «—» si la lectura no está confirmada. Liquid Glass solo cuando está disponible y Reducir transparencia está desactivado; se conserva espacio vertical para su expansión. Reducir movimiento desactiva la expansión nativa y conserva las acciones.

## Validación y QA

Checks: `npm run validate` en `apps/mobile`; typecheck raíz, lint de archivos backend modificados y pruebas de Progreso/reportes. Tests focalizados cubren rangos semanales, ownership de lecturas, 0 frente a ausencia, fallo frente a vacío, métricas activas completas/ordenadas, flechas comparables, formatos, lectura vieja, navegación y distribución de tres círculos.

QA del usuario en Simulator/iPhone: claro/oscuro, letra normal/grande, Reducir movimiento y Reducir transparencia; semanas vacía/parcial/completa; 0, 2 y 6 métricas activas; desplazamiento hasta Más sin recortar vidrio, acceso a cada métrica y cambio de semana. Los tests no sustituyen esta revisión nativa.
