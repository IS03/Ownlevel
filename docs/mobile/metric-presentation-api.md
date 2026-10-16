# Métricas: ícono, orden y carga rápida (paso 5)

EXPAND → ADOPT. Migración: `supabase/migrations/20261016180618_metric_presentation_expand.sql`.
La migración `20261016180618_metric_presentation_expand.sql` se probó en Postgres descartable y se aplicó a producción (Supabase "gym") el 2026-10-16, antes del merge. La API se despliega al mergear.

## Compatibilidad de las builds instaladas

- El GET habitual `/api/mobile/v1/metrics/definitions` conserva exactamente sus claves anteriores.
- El cliente nuevo pide `GET /api/mobile/v1/metrics/definitions?presentation=1`: cada definición suma `icon: string | null` y `quickValue: number | null`. Usa el RPC nuevo `mobile_read_metric_presentations`, invoker público / lógica privada con dueño derivado de `auth.uid()`.
- Inicio, día de Nutrición, daily-metrics e historial **no suman claves** a sus respuestas. Mobile cruza por id las definiciones opt-in, sin acceder a tablas de producto. No se cambia el contrato de Progreso.
- Los parsers compartidos aceptan dos formas exactas, no campos arbitrarios: las 11 claves originales de una definición, o esas 11 + las dos nuevas. Los campos de escritura son exactamente cuatro (legacy) o seis (presentación); nunca una ampliación parcial.
- Un intent de cuatro campos conserva ambas columnas en UPDATE. En CREATE quedan null. Se mantiene exactamente la normalización/hash anterior y el mismo ledger `metrics.definition.v1`: los recibos anteriores al EXPAND se reproducen sin cambiar su forma.
- Un intent de seis campos actualiza ambas columnas explícitamente, con el mismo CAS `expectedUpdatedAt`, clave idempotente y recibo. Sus recibos incluyen ambas propiedades. Archivar/restaurar/eliminar conservan sus intents anteriores y devuelven la forma original; la lectura posterior opt-in recupera la presentación.
- No se enriquecen recibos antiguos con datos nuevos. No se cambia la identidad de ninguna métrica del sistema.
- La Web (`src/lib/daily-metrics/server.ts`) actualiza identidad/objetivo mediante un UPDATE parcial: no escribe ni borra las columnas nuevas. Si un cambio de tipo sin historial hiciera incompatible una porción existente, la restricción lo rechaza, sin borrar ni redondear datos; se puede ajustar o quitar esa porción desde Mobile antes de cambiar el tipo.

## Modelo y permisos

`user_metrics.icon text null`: formato `^[a-z][a-z0-9-]{0,31}$`, sin enum cerrado. La app ofrece 18 claves cuidadas. Una clave desconocida o null usa el ícono actual por systemKey; una métrica propia usa `activity`. Una clave desconocida se conserva al guardar si el usuario no la cambia.

`user_metrics.quick_value numeric null`: null significa que el toque abre la carga completa. Una porción debe ser > 0, finita, hasta 9.999.999.999,9999 y válida para el tipo: entero/duración sin fracción; decimal hasta cuatro decimales. Las duraciones se guardan como minutos enteros y se editan en h/min. La restricción también protege las escrituras directas de Web. Agua usa L en almacenamiento; una porción menor a 1 L se presenta en ml, sin cambiar su unidad real.

Se conservan las políticas RLS de dueño y el trigger de updated_at existentes. Los wrappers de mutación y orden son security invoker; la lógica definer vive en `ownlevel_private`, con `search_path` vacío, dueño explícito, advisory lock 412 y permisos solo authenticated. Anon no ejecuta los wrappers ni las funciones privadas. No hay service_role en el recorrido del cliente.

No se cambia `daily_metric_values`, su historial ni el significado de los datos. Cambiar presentación sí actualiza updated_at, por lo que una carga abierta con una definición anterior puede recibir el conflicto existente en vez de guardar sobre información vieja.

## Interacciones y decisiones

- Lista editorial, sin tarjetas blancas ni íconos en cajas. El orden completo al levantar una fila es el CAS. Mover durante el gesto solo previsualiza: hay una escritura al soltar, ninguna si el orden no cambió o el gesto se cancela. Se mantiene el orden nuevo con indicador mientras guarda; un conflicto vuelve a la lista del servidor. VoiceOver ofrece Mover arriba/abajo.
- Editor AppSheet: vista previa, grilla de íconos, tipo/unidad según `actions`, objetivo y porción. Archivar/eliminar están en el menú de la hoja. Cerrar con cambios pide confirmación también desde el fondo o arrastrando.
- **Toques seguidos: bloquear, no encolar.** Hay un bloqueo síncrono antes de cualquier lectura/almacenamiento; mientras una carga se confirma, los círculos no aceptan otra y el activo muestra indicador en el aro. No hay cola de sumas diferidas ni reintentos automáticos.
- La carga rápida utiliza el mismo DayWriteController y repositorio por usuario que la hoja. El candidato es el valor absoluto anterior + porción, en aritmética de cuatro decimales. Si antes faltaba el dato, crea la porción; no se dibuja un cero como dato anterior.
- Se cotejan fecha, valor y timestamp de la pantalla con la lectura de día que aporta el CAS. La comparación de timestamps conserva microsegundos. Si el dato cambió, se refresca y se avisa; no se recalcula ni reenvía una suma sobre el nuevo valor sin otro toque explícito.
- Un resultado incierto conserva el cuerpo y la clave en el dispositivo antes del envío, para comprobarlo explícitamente. Una confirmación que solo necesita releer no vuelve a escribir. Un conflicto no produce un segundo incremento.
- Deshacer usa el snapshot y CAS posterior de la misma carga: restaura el valor exacto anterior; si faltaba, envía null para borrar, nunca 0. Si otro dispositivo cambió el dato, también respeta el conflicto y no lo pisa.
- Las confirmaciones de definiciones invalidan Inicio y Nutrición, incluso si se vuelve enseguida dentro de la ventana de caché de Inicio. El caché de presentación se aísla por cliente/usuario y una consulta anterior no pisa una publicación posterior.

## Verificación local

- `OWNLEVEL_TEST_MODULES=/tmp/ownlevel-session-step2-tools/node_modules node scripts/testing/m5-3-metric-definitions.mjs`: Postgres real descartable, incluyendo migración, recibo anterior al EXPAND, legacy que conserva campos, reglas por tipo, RLS, permisos, orden y compatibilidad del día.
- Vitest: `src/lib/mobile-api/metric-definitions.test.ts` y `src/lib/daily-metrics/server.test.ts`.
- Mobile: `npm run validate` y `npx expo export --platform ios`.
- La QA visual/funcional de controles nativos, arrastre y VoiceOver en Simulator/iPhone la hace el usuario.

## Propuestas para la descripción del PR, no implementadas

- Llevar el mismo toque rápido a los círculos de Nutrición › Tu día daría un gesto consistente, pero cambia su comportamiento actual: requiere aprobación. Por ahora solo adoptan el ícono propio; el toque sigue abriendo la carga completa.
- Autoscroll suave al acercar la fila arrastrada al borde, para listas largas. Por ahora se puede desplazar la lista antes de arrastrar y usar las acciones accesibles para mover por posiciones.
- Mostrar visualmente la porción como ayuda breve junto al círculo cuando todavía no hay un valor, si la QA indica que el gesto nuevo no se descubre. No se reemplazó «Cargar» por una acción implícita sin acordarlo.
