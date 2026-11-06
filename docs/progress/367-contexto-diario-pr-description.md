# #367 — Contexto diario completo en Insights

Presentación y navegación del día en Mobile: todas sus sesiones, con su horario y sus sensaciones, y los cuatro macros registrados. **No cambia el método:** ni comparadores, ni candidatos, ventanas, denominadores, estados de publicación ni versiones. Sin migración.

## Qué cambia

**Sesiones del día**
- Antes el contexto tomaba solo la primera sesión. Ahora el día abierto, el héroe y la entrada desde una sesión muestran todas.
- Cada sesión muestra su nombre, su horario y sus sensaciones, y abre su detalle.
- Las sensaciones van en dos filas compactas, «Antes de entrenar» y «Al terminar», junto con los carbohidratos de 3 h.
- **Orden:** por hora de inicio solo si todas la tienen legible y ninguna empata. Si no, se conserva el orden estable por id y la pantalla dice «No sabemos en qué orden fueron». Nunca se numeran.
- **Horario:** en hora de Córdoba. Una sesión sin inicio dice «Sin horario».
- **Lo del día va una sola vez**, en su propio bloque: alimentación, métricas y peso. Nunca se repite debajo de cada sesión.

**Sensaciones**
- «Sin registrar», «no se pudo leer» y respuesta tardía quedan distintas.
- Tardía significa una previa respondida después de empezar, al terminar o sin momento conocido. Se aclara debajo de la fila.
- Una nota única aclara que el momento sale del reloj del teléfono.
- La energía heredada tiene su propia fila, «registro anterior», sin momento. Nunca se muestra como energía al terminar.

**Alimentación registrada ese día**
- Calorías, proteínas, carbohidratos y grasas, del mismo `NutritionContext` que ya enviaba el servidor. La pantalla no recalcula.
- Estados distintos:
  - cero conocido;
  - «Sin dato» cuando ninguna comida tiene ese macro;
  - «parcial» con «N de M comidas sin ese dato»;
  - «Sin comidas registradas».
- El texto dice que suma lo registrado. No afirma que sea todo lo que se comió ni que haya sido antes de entrenar.

**Navegación**
- Cada sesión abre su detalle de solo lectura.
- «Ver Nutrición de ese día» abre esa fecha. Nutrición muestra «Volver a Insights» con el mismo mecanismo de origen que las tendencias de métricas.
- Desde el resumen post-entreno, la sesión de origen se marca «Esta sesión» entre las sesiones del día.
- El retorno y la coherencia de `sourceRevision` quedan como estaban: una lectura nueva reemplaza el día entero.

## Contrato y costo

- **Campo nuevo, opcional:** `sessions[].context.unreadableFeelings`, con las claves de sensaciones que existen pero no se pudieron leer.
  - Solo aparece si hay alguna; las demás sesiones conservan su forma.
  - Las exclusiones (`feeling_invalid`) no cambian.
- **Compatibilidad:** los clientes anteriores lo ignoran, porque el parser no exige ausencia de claves y el campo no está dentro de `feelings`. El contrato nuevo rechaza una clave desconocida.
- **Sin consultas nuevas ni columnas leídas nuevas.** Todo lo demás ya estaba en la respuesta: sesiones, horarios, sensaciones y los cuatro totales.
- **Peso:** a lo sumo cuatro cadenas por sesión, y solo con datos mal formados, algo que la base ya impide.

## Validación

- **Nueva** (`apps/mobile/src/insights/day-context.test.tsx`, 8 pruebas):
  - Motor: claves ilegibles sin cambio de exclusiones.
  - Contrato: acepta el campo o su ausencia y rechaza una clave desconocida.
  - Orden: conocido, sin horario y con empate.
  - Formato del horario.
  - Sensaciones: sin registrar, ilegible, tardía y heredada.
  - Macros: completos, parcial, cero, sin dato y sin comidas.
  - Pantalla: dos sesiones en orden y lo del día una sola vez.
  - Entrada desde una sesión: marca la de origen; Nutrición y su retorno.
  - Revisión nueva: reemplaza el día.
- **Ajustada:** una prueba existente, porque el nombre accesible de la sesión ahora incluye su horario.
- **Tipos y lint:** Web y Mobile, sin errores ni advertencias.
- **Pruebas:**
  - Motor y contrato: 296 pruebas, 11 omitidas: las locales y las de campaña.
  - Insights y Nutrición en Mobile: 305 pruebas.
- **Suite completa de Mobile:** 1626 pruebas pasan y 5 fallan, las mismas que en main:
  - 4 de `active-session-bridge-screen`;
  - 1 de `session-return-dock`, que pasa sola.
- No se repitieron campañas: el método no cambia. No se levantó base.

## Límites y pendientes

- **Asociaciones por sesión:** mostrar todas las sesiones no las habilita. Los días con varias sesiones siguen excluidos de sensaciones y ventanas de comida (`multiple_sessions_day`).
- **«Consistente»** sigue deshabilitado. Sin causas ni recomendaciones.
- **Lectura no disponible:** si una fuente falla, sigue fallando la lectura entera. No hay estado de error por sesión.
- **Mobile:** requiere build. La QA física queda diferida y está en la [lista única](367-qa-fisica.md).
- **Próximo incremento:** tendencias de peso.

Previews bloqueadas para `codex/367-day-context` en `vercel.json`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
