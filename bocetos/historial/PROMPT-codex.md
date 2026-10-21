# Historial de entrenamiento (Mobile) — una sola pantalla

Lee primero AGENTS.md (sección "Identidad de marca"), docs/brand/ownlevel-marca/IDENTIDAD.md (Gráficos, Estados vacíos), tema/tokens.ts (`intensity`, `chart`) y docs/mobile/m9-brand-polish-plan.md (§5 C3/C5, §9b, §9d, §10, §11). Esto es M9.3 · Training fuera de la sesión activa: es una pasada visual y de navegación. Sin backend nuevo salvo lo que se marca como EXPAND.

**Alcance:** el historial de **Entrenar**: Biblioteca › Historial, el calendario y el día de entrenamiento de esa pestaña, el historial de un ejercicio y la sesión finalizada. **Fuera de alcance:** el Historial general de la raíz (`app/history/*`, el de M6, que abren Inicio y Progreso con `/history/day/[date]`). No lo cambies ni rompas esos enlaces.

**Hay dos historiales de ejercicio distintos, a propósito:**
- **Historial completo (este prompt):** se entra desde Biblioteca/Historial, desde la ficha del ejercicio o desde la sesión finalizada. Tiene filtro por rutina, última vez, mejor marca, récord y un gráfico chico.
- **Historial rápido de la sesión en curso:** es simple y está en otro prompt (`bocetos/sesion-agregar-historial/PROMPT-codex.md`, lámina 06). No le agregues nada de lo de acá.

Va junto con los otros rediseños (`bocetos/rutinas-biblioteca/`, `bocetos/rutina-editor/`, `bocetos/biblioteca-ejercicios/`, `bocetos/sesion-agregar-historial/`). Reutilizá sus piezas: chips, filas, vidrio, colores de rutina y la tira de semana de Entrenar.

## Bocetos (fuente visual)

Carpeta: `bocetos/historial/` (PNG exportados de Pencil; el `.pen` está en `bocetos/bocetos.entrenar.pen`, encriptado). Cada lámina tiene arriba una nota que explica la intención. Los bocetos usan Inter y Lucide: en iOS va la fuente del sistema y SF Symbols. Nombres, fechas, pesos y volúmenes son de ejemplo.

- 01-historial-sesiones.png
- 02-mes-abierto-dia-elegido.png
- 03-historial-ejercicios.png
- 04-historial-de-un-ejercicio.png
- 05-sesion-finalizada.png

## Archivos de partida

- `apps/mobile/src/training/history-screen.tsx`, `history-components.tsx`, `history-model.ts`
- `training-calendar-screen.tsx`, `training-day-screen.tsx` y `calendar.ts`
- `training-week-calendar(.ios|-rn).tsx`: la tira de semana que se abre al mes, en Entrenar
- `exercise-history-screen.tsx`, `history-session-screen.tsx` y `completed-session-view.tsx`
- `session-correction-screen.tsx` y el descarte lógico (M3.4)
- `apps/mobile/src/api/training-history.ts`
- Rutas: `app/(tabs)/train/history/index.tsx`, `history/[id].tsx`, `history/exercise/[id].tsx`, `calendar.tsx` y `day/[date].tsx`

## Qué hay que construir

### 1. Una sola pantalla de Historial (láminas 01 y 02)
- Large Title nativo "Historial" y un control segmentado nativo "Sesiones | Ejercicios". Botón volver de vidrio. Sale el botón de calendario de la barra.
- **Pestaña Sesiones:**
  - **Tira de semana arriba:** el mismo componente de Entrenar (vidrio, se abre al mes en el lugar, con fallback en Android, iOS anterior y "Reducir transparencia"). Encabezado "5 – 11 oct" y "Ver mes".
  - **Intensidad del día, relativa a la persona,** con la escala `intensity` de 5 pasos de la marca:
    - Paso 0 = no entrenó.
    - Pasos 1 a 4 = cuartiles de sus propios días entrenados (por series completadas en el día) en una ventana reciente, por ejemplo 12 semanas.
    - Con pocos días de historia, un criterio fijo razonable.
    - Proponé dónde calcularlo (servidor o cliente) y justificalo. Si se calcula en el cliente con datos parciales, no puede pintar un día como "bajo" por falta de datos: missing ≠ zero.
    - Incluí una leyenda chica "Menos ▢▢▢▢▢ Más" en el mes.
    - Fuera los puntos violeta de hoy.
  - **Mes abierto:** el mismo vidrio, con hoy marcado y los días futuros en gris. **Tocar un día** filtra la lista a ese día y muestra su resumen (sesiones, duración, series y volumen, como la pantalla "Día" de hoy), con "Ver todo" para volver.
  - **Lista agrupada por día:** el encabezado lleva el día ("Viernes 9", con el año solo si no es el actual) y, a la derecha, sus totales ("2 sesiones · 1 h 36 min").
  - **Fila de sesión:** tira con el **color de la rutina** (sin color = sin tira, no gris), nombre, "14:40 · 1 h 28 min" en Footnote gris, y a la derecha "26 series" y "7.462 kg" con cifras tabulares. Flecha ›.
  - Volumen nulo = no se muestra (missing ≠ zero).
- **Las pantallas "Calendario" y "Día" de Entrenar dejan de existir como pantallas separadas.**
  - Sus rutas (`train/calendar`, `train/day/[date]`) redirigen al Historial: la del día, con ese día ya elegido.
  - Tocar un día pasado en la tira de Entrenar (hoy va a `train/day/[fecha]`, §9d) abre el Historial en ese día.
  - Revisá todos los lugares que usan esas rutas.
- Mantener paginación, pull to refresh, estados de carga y no disponible (con lectura vieja) y vacío real ("Todavía no terminaste ningún entrenamiento"). empty ≠ unavailable.

### 2. Pestaña Ejercicios (lámina 03)
- Buscador nativo y chips de grupo muscular, como en la biblioteca de ejercicios.
- Orden con un menú nativo: **Recientes** (por defecto) o **A–Z**.
- **Fila:** nombre, "Músculo · Implemento" en gris y, a la derecha, la última marca ("12,5 kg × 15") con la fecha debajo ("9 oct"), en cifras tabulares, respetando el modo de peso. Fuera el renglón "Última: … · 15 sesiones" (la cantidad de sesiones puede ir en la pantalla del ejercicio).
- Tocar abre el historial completo del ejercicio.

### 3. Historial completo de un ejercicio (lámina 04)
- Large Title con el nombre y "Historial · Implemento · Peso que anotás".
- **Chips por rutina** "Todas · PUSH · PULL" (las rutinas donde aparece). Arrancan en la rutina de origen si se entra desde el editor de una rutina o desde una sesión finalizada de esa rutina; si no, en "Todas".
  - Depende del paso 4 del prompt de la sesión (`routineId` en las entradas y filtro en el servidor).
  - Si ese paso todavía no está, mostrá "Todas" sin chips. Nada de filtrar por nombre.
- **Una sola tarjeta** con "Última vez" y "Mejor en PUSH" lado a lado. La etiqueta **"Récord"** va solo si esa marca es la mejor real; el récord es uno de los usos permitidos del acento. Cuando la última y la mejor son la misma sesión, no repitas dos tarjetas iguales.
- **Gráfico chico** "Mejor serie por sesión · kg": barras **desde 0**.
  - Las sesiones anteriores van en champagne claro y la última en acento.
  - **Sin dato = hueco** (con "—" chico), nunca una barra de 0 ni interpolación.
  - Dos fechas en el eje y etiqueta directa encima de cada barra.
  - Hasta unas 8 sesiones.
  - Respeta el modo de peso: si no son kg (por ejemplo, tiempo o lingotes), adaptá la unidad o no muestres el gráfico.
  - Es intencionalmente chico: el análisis grande va a vivir en Progreso más adelante.
- **Lista de sesiones:** "Lunes 5 de octubre · PUSH" en gris y "55 kg × 12 · 3 series". Tocar abre la sesión finalizada.
- Los estados cargando, no disponible y sin sesiones (en general o para el filtro), distintos entre sí.

### 4. Sesión finalizada (lámina 05)
- Large Title con el nombre de la rutina y la tira de su color. Debajo, "Mié 7 oct · 14:43–15:57 · 1 h 14 min". Fuera "SESIÓN FINALIZADA" en mayúsculas (C18) y el formato "07 OCT 2026".
- **Tres números** en tarjetas chicas: series, "6 de 8" ejercicios y volumen (si existe).
- **Resumen** (energía, rendimiento, dolor y notas) en texto neutro, sin colores de bien o mal. Si no hay resumen, el bloque no aparece.
- **Por ejercicio:** nombre, "Músculo · Implemento · Peso que anotás", "Historial" (abre el historial completo filtrado en esta rutina) y sus series.
  - **Sin el check champagne en cada serie** (C3).
  - Las series no hechas se ven en gris con "no hecha", **solo si la sesión guardada las conserva**. Si no las guarda, no las muestres.
  - Los ejercicios que no se hicieron, si el dato existe, al final en gris.
- **`•••` de vidrio arriba a la derecha:** **Corregir sesión** (el flujo existente) y **Eliminar sesión** (el descarte lógico existente, en rojo, con la confirmación actual). Salen los dos botones del pie.
- `completed-session-view.tsx` también puede usarse en otros lugares (por ejemplo, después de finalizar). Verificá dónde, y que el cambio quede bien ahí o se separe.

## Reglas
- Antes de implementar, presentá el plan con alcance, riesgos y archivos, y esperá mi OK. Si ves un corte real de PR (por ejemplo, la pantalla única con calendario por un lado y el ejercicio y la sesión finalizada por otro), proponelo.
- No tocar: el Historial general de la raíz, contratos de API (salvo un EXPAND que propongas y yo apruebe, por ejemplo para la intensidad relativa), corrección y descarte (solo cambia desde dónde se llaman) ni la sesión en curso.
- Datos fieles: missing ≠ zero, empty ≠ unavailable, sin barras fantasma, sin interpolar, "Récord" solo si es verdad.
- Marca: un solo acento; rojo solo para eliminar y para errores del sistema; vidrio solo en controles (tira o mes del calendario, botones de la barra y menú); cifras tabulares; escala tipográfica y medidas de la marca; voseo. Haptics según la tabla de la marca (C12).
- Respetar "Reducir movimiento" y probar en claro y oscuro. QA en Simulator/iPhone con historia real (varios meses, días con 2 sesiones, rutinas sin color, ejercicios con modos de peso distintos).
- Tests: agrupación por día y totales, redirección de las rutas viejas con fecha, intensidad relativa (incluido el caso con pocos datos), gráfico con huecos y modos de peso, "Récord" solo cuando corresponde y series no hechas según el dato.
- Validar con `npm run validate` en apps/mobile.
- No commitear, pushear ni abrir PR hasta que lo pida.
