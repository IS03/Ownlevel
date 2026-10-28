# #303 · diagnóstico global y primera intervención

Baseline: `main` en `8f9e890`, con #316, #317 y la revisión independiente `85ccc95`. Esas garantías de guardado no se rehacen. Fecha del diagnóstico: 27/10/2026.

## Matriz de diagnóstico

Son hechos del código y pruebas controladas, salvo donde se indica pendiente de medición. No se inspeccionaron ni modificaron datos reales para reproducirlos.

| Pantalla | Síntoma | Causa demostrada | Solución propuesta | Riesgo | Prioridad |
|---|---|---|---|---|---|
| Inicio | Consultas al regresar y duplicación entre áreas | `useHomeResources` crea siete recursos independientes, en paralelo; limita foco a 30 s y conserva respuestas mientras sigue montado. No comparte los GET coincidentes de Cuerpo/Entrenamiento con Progreso. Foreground refresca los recursos montados. | Reutilizar lecturas coincidentes e invalidar por dominio, después de esta primera adopción. | Día/semana, escritura de métricas y lecturas parciales. | Media |
| Entrenar | Reentrada en biblioteca, rutinas e historial vuelve a leer | `TrainingHubCache` ya conserva semanas/meses con vigencia de 30 s; rutinas usan un recurso por montaje y biblioteca revalida en foco. `loadHubWeek` comienza cada semana desde el cursor inicial: semanas distintas pueden descargar las mismas páginas. | Compartir lecturas y páginas cuando coincidan; conservar lecturas operativas directas. | CAS, cambios confirmados, paginación y recuperación. | Media |
| Nutrición | Cambiar fecha/reabrir día vuelve a cargar; reportes se reutilizan de forma distinta según la entrada | El día crea su controlador por cliente/fecha y no lo retiene al desmontar. Existe caché/prefetch de reportes con epochs de invalidación, pero Progreso Nutrición usa otro hook sin esa reutilización. Las mutaciones fuerzan `reload` para excluir lecturas previas a la escritura. | Consolidar el reporte existente y luego retener días con invalidación de fechas origen/destino. | Totales, snapshots, cero/ausencia, baseline de edición. | Alta, siguiente intervención |
| Progreso | Repetir pantalla o período muestra carga y repite la consulta | `useProgressResource` descarta el controlador al cambiar clave/desmontar y vuelve a consultar por foco. Dos consumidores tienen dos controladores. Pruebas reproducen dos GET equivalentes y una segunda espera de 3 s. El overview del servidor ya ejecuta sus cuatro áreas mediante `Promise.all`. | Primera PR: retener controladores para resumen, Cuerpo, Entrenamiento y Métricas, con claves completas y actualización visible. | Cuenta, período, cambios remotos y respuestas anteriores a escrituras. | Alta, implementada parcialmente |
| Ajustes | Reentrar vuelve a cargar perfil/resúmenes/configuración | `useSettingsOverview` conserva parte del resumen por cliente+usuario, pero cada foco lanza tres lecturas y `controller.load()`. Su generación evita publicaciones viejas, pero no deduplica HTTP concurrentes de foco/foreground. Los formularios tienen su propio baseline y bloqueo de carga. | Deduplicar el resumen existente y revisar vigencia; mantener los baselines de formularios fuera de caché de presentación. | Formularios, versión de configuración y datos físicos. | Media |

Fuentes principales: [Inicio](../../apps/mobile/src/home/home-data.ts), [Entrenar](../../apps/mobile/src/training/training-hub-data.ts), [día nutricional](../../apps/mobile/src/nutrition/day-resource.ts), [reportes existentes](../../apps/mobile/src/nutrition/report-resource.ts), [hook previo de Progreso](../../apps/mobile/src/progress/use-progress-resource.ts), [Ajustes](../../apps/mobile/src/settings/use-settings-overview.ts), [overview del backend](../../src/lib/mobile-api/progress-server.ts).

## Qué no está demostrado

- No hay una medición física de Release de latencia API, serialización, agregaciones, imágenes, gráficos o bloqueo del hilo JS. No se les atribuye una causa sin ese perfil.
- Las agregaciones pueden tener costo, pero el overview ya paraleliza sus áreas; no se justifica cambiar SQL, contratos o backend con la evidencia actual.
- Los gráficos se vuelven a montar cuando corresponde. Esta PR no promete reducir su costo de renderizado ni FPS; verifica que los datos reutilizados no pasen por el estado vacío de carga.
- La cuenta de siete recursos de Inicio no es el total de requests de la app: existen proveedores compartidos, opciones rápidas y paginación de historial. Los conteos siguientes corresponden sólo a las lecturas controladas indicadas.

## Estrategia implementada

Se reutiliza `ApiResourceController`, incluyendo la última respuesta confirmada, su hora y su protección contra respuestas obsoletas. No se mantiene otra copia del DTO ni se agrega una librería.

- Adopción explícita en cuatro pantallas: resumen de Progreso, Cuerpo, Entrenamiento y Métricas. El resto conserva sus mecanismos actuales.
- Vistas, conexiones, insight, Explorar y Progreso Nutrición aún pueden consultar al foco. Por eso puede seguir apareciendo un indicador real de actualización auxiliar aunque el contenido principal ya esté disponible. También continúan las lecturas operativas de Cuerpo para sus formularios.
- Memoria únicamente. Objetivo de hasta 40 entradas retenidas mediante LRU (24 en la primera intervención; se amplió al sumar días y reportes de Nutrición); los controladores observados no se expulsan y se vuelve a aplicar el límite al desuscribirse.
- Clave: cliente de la cuenta autenticada + familia de recurso + día de Córdoba + clave completa de período/comparación/métrica. Las familias evitan colisiones entre respuestas distintas para el mismo período.
- Un cliente nuevo al cambiar cuenta/cerrar sesión; se retira el caché anterior y se reinicia el árbol dependiente de esa cuenta, incluidos lectores locales no compartidos. Renovar el token de la misma cuenta conserva cliente, árbol y controlador de entrenamiento. También quedan aisladas por cuenta las cachés existentes que ya usan `WeakMap<MobileApiClient, …>`.
- Retorno por foco dentro de 30 s: muestra la lectura confirmada sin otro GET. Al vencer la ventana, la lectura sigue visible y se revalida. No se renueva `confirmedAt` por reutilizarla.
- Foreground de una pantalla enfocada y refresh manual: consulta remota incluso dentro de la ventana. Las pantallas ocultas adoptadas no disparan GET al volver del background.
- Dos consumidores de una misma clave comparten el controlador y su petición en curso. Una revalidación ya solicitada puede terminar después de salir para aprovecharla al volver; una primera carga que nadie espera (cambios rápidos de fecha o período) se cancela. No se precargan pantallas no visitadas.
- La interfaz muestra «Lectura de las …» o «Actualizando · lectura de las …» con `AppText` de marca y cifras tabulares. Los errores conservan sus avisos existentes. Identidad: [fuente canónica](../brand/ownlevel-marca/IDENTIDAD.md).
- Una denegación explícita de autorización retira la respuesta protegida anterior. Una falla transitoria mantiene la información conocida, diferenciada de una lectura fresca o un vacío real.

No se introduce prefetch general de Progreso desde Inicio: faltan datos de uso/costo para justificar solicitudes adicionales. Primero se evita repetir las que el usuario ya hizo.

## Invalidación e integridad

La notificación ocurre al terminar una escritura mediante el cliente API, antes de devolver el resultado al caller. Incluye conflictos y resultados ambiguos; nunca confirma ni reintenta esa escritura.

| Escritura | Lecturas adoptadas invalidadas |
|---|---|
| Entrenamiento | Resumen y Entrenamiento |
| Cuerpo | Resumen y Cuerpo |
| Definiciones/métricas | Resumen y Métricas |
| Nutrición | Resumen y Métricas (el registro del día contiene métricas) |
| Perfil físico | Resumen, Cuerpo y Métricas |

Es una granularidad conservadora por dominio, no por cada campo. Los recursos ocultos se marcan inválidos y abortan una lectura anterior sin iniciar otra; los enfocados revalidan. Un transporte que ignore abort tampoco puede publicar una respuesta anterior sobre una nueva. Las escrituras rechazadas por validación/autenticación no se presentan como cambios confirmados.

La caché sólo sirve para presentación analítica. `client.read` y los GET de `client.request` siguen accediendo a red: los controladores de entrenamiento, notas, finalización, eliminación, comidas, peso y configuración nunca usan estas respuestas como baseline CAS ni como confirmación de un write. Se preservan #316, #317, idempotencia, reconciliación, snapshots y reglas nutricionales.

## Mediciones comparables

Reloj controlado de Jest, carga simulada de 3.000 ms, misma clave y sin escrituras entre visitas:

| Caso | Antes | Después |
|---|---|---|
| Primera entrada | `loading`; una petición; dato tras 3.000 ms | Igual: no se inventa una respuesta |
| Segunda entrada dentro de 30 s | `loading`; otra petición; otra espera de 3.000 ms | `ready` en el primer render del hook; sin petición adicional |
| Requests acumulados en ambas visitas | 2 | 1 |
| Dos consumidores concurrentes de una clave | 2 peticiones | 1 petición compartida |
| Hora de confirmación al reutilizar | Sin reutilización | Se conserva la original |

El baseline falló en dos pruebas de regresión antes de implementar; después pasan con `repeatImmediate: ready` y `requests: 1`. Es tiempo hasta estado útil en una prueba React, no latencia de dibujo nativo. La latencia remota fría no fue reducida ni se anuncia como mejorada. No se estiman costos de Vercel/Supabase ni FPS sin mediciones reales.

Diagnóstico Development: `[OWNLEVEL Read Reuse]` emite familia, evento (`reuse`, `network`, `join`, `settled`, `invalidate`, `evict`), disparador, antigüedad y duración. No registra claves, IDs, nombres, métricas, pesos, comidas, tokens ni payloads. Los eventos de consumidor/foco no equivalen al conteo HTTP: para solicitudes efectivas se cotejan los eventos API existentes de los endpoints correspondientes.

Validación de esta intervención: `npm run validate` desde `apps/mobile` pasó con tipos, lint sin warnings, 174 suites / 1.385 pruebas y configuración Expo. Incluye clientes/API parsers, primera/segunda visita, TTL, concurrencia, foreground, respuesta fuera de orden, error frente a vacío, denegación de acceso, cuenta/logout, invalidación cruzada y regresiones #316/#317. Jest emitió advertencias de `act(...)` en algunos tests de pantalla, sin fallos. `git diff --check` pasó. No se cambiaron contratos ni código backend; no se ejecutó una validación contra datos de producción.

## QA físico

Metro está preparado desde el worktree de esta PR con la configuración Development habitual. Se verificaron el manifiesto y el bundle iOS servido por LAN, incluida esta intervención y las garantías #316/#317. La instalación Diario permanece intacta.

Al conectar el iPhone, iOS rechazó la firma vencida de OWNLEVEL Dev. Se renovó Debug exclusivamente en este worktree y con DerivedData aislado, sin prebuild ni cambios en el proyecto nativo principal. Tras completar personalmente el acceso de Xcode, `xcodebuild` pasó. Se verificaron bundle ID Dev, equipo, identificador de aplicación, grupos de llavero, vigencia y dispositivo del perfil, además de `codesign --verify --deep --strict`. La actualización de Dev se instaló sin desinstalar; Diario no se modificó. La conexión física está pendiente de desbloquear el iPhone. Los tiempos de Development deben registrarse aparte de Release.

Usar la misma cuenta/red, sin mutar datos entre las primeras dos vueltas. Medir por separado primera información útil y fin de actualización:

1. Primera vuelta: Inicio → Entrenar (rutinas, biblioteca, historial) → Nutrición (hoy y otro día) → Progreso (resumen, Cuerpo, Entrenamiento, Métricas y Nutrición) → Ajustes (resumen, Energía, Datos físicos).
2. Repetir enseguida, dentro de 30 s. En las cuatro pantallas adoptadas de Progreso debe aparecer el contenido conocido inmediatamente; la hora de lectura permanece y no hay otro GET equivalente. Las demás superficies sirven de control: conservan su comportamiento actual.
3. En Progreso cambiar período y comparación; volver al anterior. Verificar cifras y etiquetas del rango correcto, incluidos huecos, ceros y negativos. Repetir después de más de 30 s: contenido anterior visible mientras se actualiza.
4. Background/bloqueo y regreso: sólo las lecturas adoptadas enfocadas revalidan; conservar navegación/edición de la sesión activa conforme a #317. La UI debe indicar actualización real.
5. En registros de prueba, cambiar un peso o una métrica desde otra sección y volver a Progreso antes de 30 s: el dominio afectado debe revalidar. Confirmar la persistencia desde las pantallas operativas, nunca por una cifra cacheada.
6. Interrumpir red: distinguir la última lectura y el error de un estado vacío. Volver a conectar y refrescar. Comprobar cambio de cuenta/logout sin datos de la cuenta anterior.
7. Repetir eliminación de ejercicio y guardado de nota durante revalidación: no regresión de #316 ni de la revisión de #317.

No se aprueba #303 ni se cierran #310/#311 por esta PR. El layout específico de Nutrición y Ajustes se valida en sus propios issues.

## Bloque A · Nutrición

- El reporte nutricional dejó su caché propia (WeakMap, prefetch, epochs e invalidación manual) y usa la familia `nutrition-report` de `ConfirmedReadCache`. La semana, el calendario, el reporte y Progreso Nutrición comparten una lectura por cuenta, día de Córdoba y rango. El prefetch del calendario es la misma entrada, sin otra petición.
- Los días visitados se retienen en la familia `nutrition-day`. Volver a una fecha dentro de los 30 s la muestra sin GET. La proyección de la hoja de comida comparte la lectura del día en vez de pedirla otra vez.
- Ambas familias se invalidan con escrituras de nutrición, cuerpo/datos físicos y entrenamiento, porque los objetivos dependen del día de entrenamiento y la energía, del peso. Granularidad por dominio, no por fecha: se prefiere invalidar de más antes que mostrar una fecha vieja.
- `reload` después de una escritura confirmada se suma sólo a la lectura que inició la invalidación de esa escritura. Cualquier otra lectura en curso puede ser anterior, así que se aborta y se lee de nuevo. Antes, cada guardado del día disparaba dos GET, uno de ellos abortado.
- `meal-preview` (POST que sólo calcula) ya no invalida lecturas.
- Formularios, versiones y CAS de comidas siguen usando las respuestas de sus escrituras. La lectura retenida es presentación: con datos vencidos, el servidor rechaza una escritura con versión vieja como antes.

## Bloque B · Inicio y Entrenar

- El hub de Entrenar volvía a pedir sus siete recursos (inicio, meses y semana con páginas de historial) en cada foco, aun al volver de Rutinas o Historial un segundo después. Ahora el foco vuelve a leer sólo los recursos vencidos (30 s, la ventana que ya tenía el hub) o todos si hubo una escritura. El refresh manual, el primer plano y el inicio de una sesión siguen leyendo siempre.
- Inicio, dentro de su ventana de 30 s, no se enteraba de escrituras hechas en otras secciones: registrar una comida en Nutrición y volver mostraba las calorías anteriores. Ahora refresca al enfocar si hubo cualquier escritura de la cuenta desde su última lectura.
- Ambos usan el contador de escrituras de `ConfirmedReadCache` (`settledWrites`): cuenta toda escritura asentada del cliente de la cuenta, aunque todavía no exista ninguna lectura retenida.
- Sin cambios, con motivo:
  - Rutinas y biblioteca: la lista de rutinas es la base CAS del reordenamiento, y la biblioteca es operativa.
  - Compartir Cuerpo/Entrenamiento entre Inicio y Progreso no sirve: Inicio pide 7 y 30 días, y Progreso empieza en el mes calendario.
  - Deduplicar `fetchMobileHome` y la página 1 del historial entre Inicio y el hub ahorraría una lectura por primera visita, pero requiere pasar el disparador a cada loader. Es marginal frente al riesgo de que un refresh manual reutilice datos, así que queda documentado.

## Bloque C · Ajustes y Progreso restante

- Las demás lecturas de Progreso pasan por la familia `progress-extra` de `ConfirmedReadCache`, mediante `useProgressResource`, que conserva su firma. Son vistas, edición de vistas, conexiones, insight, Explorar y sus hojas, cuándo comés, etapas, influencia y detalle de ejercicio. Con esto, todo Progreso reutiliza lecturas confirmadas. Cada clave lleva el prefijo de su tipo de lectura. La entrada «Cuándo comés» de Progreso Nutrición y su pantalla comparten la lectura cuando no hay comparación (es la misma consulta).
- Se agregan los dominios `views` e `insight`: guardar, renombrar, ordenar o borrar una vista, o descartar el insight, invalida esas lecturas. Las escrituras de datos (nutrición, cuerpo, entrenamiento y métricas) también las invalidan.
- Los cambios rápidos de período o comparación reutilizan lo ya leído y cancelan las primeras cargas abandonadas.
- Resumen de Ajustes:
  - Al enfocar, vuelve a leer perfil, etapas y métricas (y recarga la configuración nutricional) sólo si no hay una lectura completa, si venció la ventana de 30 s o si hubo una escritura de la cuenta.
  - Al volver del segundo plano, relee sólo si Ajustes está visible, y no en cada transición `inactive → active`.
  - Una lectura parcial o fallida no abre la ventana.
  - Los formularios (nombre, energía, datos físicos) siguen usando sus propios controladores y versiones.

## Siguientes intervenciones

1. Consolidar la caché de reportes de Nutrición con su consumo desde Progreso; acotar retención y reutilizar consultas idénticas desde Inicio, sin otra copia del DTO. Adoptar luego vistas, conexiones y Explorar con sus claves e invalidaciones específicas, antes de afirmar que todo Progreso reutiliza lecturas.
2. Reutilizar selectivamente lecturas de Inicio/Entrenar y páginas de historial; medir volumen y presupuesto antes de precargar semanas o agregar endpoints.
3. Retener días nutricionales con invalidación precisa por fechas tras crear, editar, mover o borrar, sin convertir una lectura cacheada en baseline de mutación.
4. Deduplicar el resumen de Ajustes y separar su vigencia de la validación de formularios.
5. Perfilar Release física para decidir si API/agregaciones o gráficos necesitan otra intervención. Sin evidencia, no cambiar backend ni rediseñar pantallas.
