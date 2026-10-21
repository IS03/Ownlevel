# Cuenta, Ajustes y entrada · pasos para Codex

Un paso por PR, en este orden. Bocetos: `bocetos/ajustes/` (PNG) y `bocetos/bocetos.entrenar.pen`. Plan y decisiones: `bocetos/ajustes/PLAN.md`.

| Paso | Qué | Backend |
|---|---|---|
| 1 | Entrada escalonada (EN-C) con brillo en el logo y 4 botones | No |
| 2 | Etapas del plan: modelo y Mobile API (crear, reemplazar, programar secuencias) | **EXPAND con migración** |
| 3 | Ajustes editorial (AJ-A) + Perfil + Energía + Datos físicos | No |
| 4 | Etapas en Ajustes (ET1, ET3, ET4) + plan por día (AJ3, AJ4) | Usa el paso 2 |
| 5 | Métricas: ícono, orden y carga rápida (M4, M5, AJ8, AJ9) | **EXPAND con migración** |
| 6 | Eliminar cuenta (AJ7) | **EXPAND** |

Después (pendientes, no en esta tanda): Comparar etapas en Progreso (ET2); Apple, mail y passkey funcionando.

## Bloque común (va en todos los prompts)

```
Reglas de esta tanda (además de AGENTS.md e IDENTIDAD.md):
- Nada se queda congelado esperando el servidor. Cada carga muestra algo: esqueleto con la forma final, el último dato con un indicador sutil, o el botón que se convierte en indicador y después en ✓ (como Nutrición: apps/mobile/src/nutrition/save-button.tsx). Nunca una pantalla en blanco ni un "Cargando…" suelto.
- Movimiento con propósito: 200/300 ms, resorte suave, presión al 95 %. Los números que cambian cuentan hasta el valor nuevo (apps/mobile/src/nutrition/use-tweened-number.ts). Con Reducir movimiento, solo fundidos.
- Hojas propias con AppSheet (apps/mobile/src/design-system/app-sheet.tsx): entran y salen igual, se cierran arrastrando.
- Avisos de guardado/deshacer con el toast de vidrio arriba de la barra (apps/mobile/src/nutrition/nutrition-toast.tsx).
- Sin tarjetas blancas para listas: estilo editorial (contenido directo sobre el fondo con el resplandor, renglones con línea fina, titulares grandes). Vidrio solo en controles.
- Sin textos técnicos ("intento", "versión", "lectura", "male"). Voseo, sin exclamaciones salvo logros.
- Si ves un lugar donde una animación o un detalle mejoraría la experiencia y no está en el boceto, proponelo en la descripción del PR (no lo implementes sin preguntar si cambia el comportamiento).
- Validá con `npm run validate` en apps/mobile (y los tests del servidor que toques) y armá el bundle con `npx expo export --platform ios` (atrapa imports que Metro no resuelve aunque Jest y tsc pasen). No commit/push/PR hasta que se pida.
```

---

## Prompt · Paso 1 · Entrada escalonada

```
Rediseñá la pantalla de entrada de Mobile (apps/mobile/app/(auth)/sign-in.tsx) según el boceto EN-C "Subir de nivel" (bocetos/ajustes/R3-EN-C-subir-de-nivel.png). No toques la lógica de autenticación (apps/mobile/src/auth): solo la presentación.

[Pegá acá el "Bloque común" de bocetos/ajustes/PROMPTS-codex.md]

Diseño:
- Fondo grafito siempre oscuro (degradado #26262A → #09090B, como el ícono), sin depender del tema del sistema.
- Abajo, 7 barras champagne verticales (degradado #DCCBA3 → #A8935F, esquinas de arriba redondeadas) de distinta altura, como un gráfico de semanas. Más finas que en el boceto: dejá ~10–12 pt de aire entre barras. En reposo "respiran" apenas (cada una sube y baja 4–8 pt, desfasadas, lento).
- Al centro, el logo vertical de OWNLEVEL (isotipo + wordmark). El SVG está en docs/brand/ownlevel-marca/logo/logo-vertical-oscuro.svg y es todo paths: pasalo a un componente react-native-svg (no agregues dependencias).
- Brillo en el wordmark "OWNLEVEL": una franja de luz metálica que pasa de izquierda a derecha cada ~4 s, como luz rasante (un LinearGradient dentro del SVG con stops blanco translúcido / transparente, animado con Reanimated useAnimatedProps). Sutil, no dorado chillón. Con Reducir movimiento, sin brillo.
- Debajo del logo, cuatro botones apilados (alto 50, radio 14):
  1. "Continuar con Apple" (blanco, texto negro, ícono de Apple). Sin funcionalidad todavía.
  2. "Continuar con Google" (vidrio oscuro con borde fino). Es el único que funciona: usa signInWithGoogle como hoy.
  3. "Continuar con tu mail" (texto, sin fondo, ícono de sobre). Sin funcionalidad.
  4. "Usar una passkey" (texto, sin fondo, ícono de llave). Sin funcionalidad.
  Los tres sin funcionalidad, al tocarlos muestran un aviso neutro ("Muy pronto vas a poder entrar así.") sin rojo, con el mismo estilo de aviso de abajo. Que se note que no están rotos: aviso breve y listo.
- Abajo, chico: "Al continuar aceptás los Términos y la Política de privacidad." (por ahora sin links si no existen las URL; dejá un TODO claro).

Animación al entrar:
- Al tocar Google: los botones se apagan, el tocado muestra el indicador nativo. Las barras suben de a una, de izquierda a derecha, cada una un escalón más alta que la anterior (como subir de nivel) mientras se conecta.
- Cuando la sesión se confirma: la escalera termina, el champagne cubre la pantalla y se funde en Inicio (sin corte brusco).
- Si falla o se cancela: las barras bajan a su lugar y aparece el aviso neutro arriba de los botones (como hoy, con el mismo texto de error del servicio de auth). Cancelar a propósito no muestra aviso.
- Estados existentes que hay que respetar: BOOTSTRAPPING (comprobando sesión: logo con brillo y barras respirando, sin botones), SIGNING_IN, SIGNED_OUT (con notice), TRANSIENT_ERROR (con "Reintentar").
- Reducir movimiento: sin respirar, sin escalera; un fundido al entrar.

Accesibilidad: cada botón con su etiqueta; el aviso con accessibilityLiveRegion; las barras y el brillo ocultos para VoiceOver.

Tests: actualizá los de la entrada (estados y que solo Google llame al servicio; los otros tres muestran el aviso).

No incluyas Apple/mail/passkey reales: eso queda anotado en bocetos/PENDIENTES.md ("Entrada y cuenta").
```

---

## Prompt · Paso 2 · Etapas del plan (servidor + Mobile API)

Ver el bloque en el mensaje del 16/10 (copiado abajo).

Los prompts de los pasos 3 a 6 se escriben cuando termine cada paso anterior, con lo que se vea en el PR.

### Paso 2 (texto completo)

```
Paso 2 de Cuenta y Ajustes: etapas del plan nutricional, solo servidor y Mobile API (sin pantallas todavía; las pantallas son el paso 4). Bocetos de referencia: bocetos/ajustes/R2-ET1-etapas.png, R3-ET3-cambiar-el-plan.png y R3-ET4-programar-etapas.png. Plan: bocetos/ajustes/PLAN.md (rondas 2 y 3).

Qué tiene que poder hacer el usuario:
1. Cambiar el plan desde hoy (el que decide sobre la marcha): el plan nuevo empieza hoy, sin fecha de fin, hasta que lo cambie otra vez.
2. Programar una secuencia de etapas (el que planifica): por ejemplo 3 meses superávit, 2 déficit y 1 mantenimiento, una detrás de otra, con qué pasa al terminar (seguir en la última o pasar a mantenimiento).
3. Ver sus etapas: pasadas, la actual y las programadas.
4. Editar o borrar una etapa que todavía no empezó, y cortar una secuencia.
Lo vivido nunca cambia: una etapa que ya empezó no se edita ni se borra (solo la de hoy, como ya pasa hoy).

Cómo funciona hoy (respetalo, no lo reescribas):
- El plan vive en public.nutrition_plan_periods (effective_from, name, agua, extras de entrenamiento) + public.nutrition_plan_weekdays (kcal y proteína por día de semana).
- El plan de un día es el último período con effective_from <= esa fecha (supabase/migrations/20260813163000_nutrition_day_engine.sql).
- Cada día guarda con qué plan se calculó (day_logs.nutrition_plan_period_id). Eso es lo que después permite comparar etapas en Progreso: no lo rompas.
- save_nutrition_plan_v2 (supabase/migrations/20261004175844_mobile_nutrition_configuration.sql) hace upsert del período de HOY y refresca el día de hoy. La Web y la configuración actual de Mobile lo usan: tienen que seguir funcionando igual.

Diseño (EXPAND, todo aditivo; rollout EXPAND → ADOPT):
- Migración nueva con:
  - nutrition_plan_periods: columna stage_kind text null (check: 'maintenance','deficit','surplus','recomposition','custom'); null = plan viejo sin tipo. Columnas sequence_id uuid null y sequence_position smallint null.
  - Tabla nutrition_plan_sequences (id, user_id, name, after_end text check in ('keep_last','maintenance'), created_at), con RLS solo dueño, FK compuesta (id, user_id) como el resto.
  - Una etapa programada es simplemente un período con effective_from futuro: el motor del día ya la toma sola cuando llega la fecha. No agregues "ends_on": el fin de una etapa es el effective_from de la siguiente (calculalo al leer).
  - "Al terminar → mantenimiento" se guarda como un período más al final de la secuencia (stage_kind 'maintenance'). "Seguir en la última" no agrega nada.
  - Funciones definer en ownlevel_private detrás de wrappers security invoker en public (mismo patrón que las migraciones de Progreso de esta semana), con advisory lock por usuario como save_nutrition_plan_v2:
    - replace_plan_from_today(stage): crea/actualiza el período de hoy (con tipo y nombre) y refresca el día de hoy. Parámetro explícito future_stages 'keep' | 'cancel': si hay etapas programadas, el cliente decide si se mantienen o se cancelan (nunca en silencio).
    - schedule_plan_sequence(name, after_end, start_date, stages[]): cada stage con tipo, nombre, duración (en días ya resueltos por el cliente o semanas/meses resueltos en el servidor: elegí uno y documentalo; recomiendo que el servidor calcule las fechas desde start_date y la duración en semanas/meses de calendario, en zona America/Argentina/Cordoba), agua, extras y 7 días con kcal y proteína. start_date >= hoy. Si start_date es hoy, la primera etapa reemplaza el período de hoy. Falla si se pisa una etapa que ya empezó.
    - update_future_stage / delete_future_stage / cancel_sequence: solo etapas con effective_from > hoy. Borrar una del medio de una secuencia corre las siguientes (o falla con un error claro; elegí y documentalo).
  - Concurrencia: CAS con una versión de la lista de etapas del usuario (como progress_views: listVersion) para que dos dispositivos no se pisen. Idempotencia con mobile_idempotency_keys en todas las escrituras.
- Mobile API:
  - GET /api/mobile/v1/nutrition/stages → { today, listVersion, current: Stage | null, upcoming: Stage[], past: Stage[], sequences: Sequence[] }. Stage = { id, name, kind | null, startsOn, endsOn | null (exclusivo o inclusivo, documentalo), weekdays[7], baseWaterL, trainingCalorieDeltaKcal, trainingWaterDeltaL, sequenceId | null, position | null, status: 'past'|'current'|'upcoming' }. Pasado limitado (por ejemplo últimas 24 etapas) con orden estable.
  - POST /api/mobile/v1/nutrition/stages con intents { operation: 'replace_from_today' | 'schedule_sequence' | 'update_future' | 'delete_future' | 'cancel_sequence', expectedListVersion, idempotencyKey, ... }. Respuestas: confirmado (con la lista nueva o su versión), conflict (la lista cambió: devolver la verdad del servidor), validation (mensaje en castellano, sin jerga).
  - Contratos en src/lib/mobile-api/*-contract.ts (puros, compartidos con Expo, mismo estilo que nutrition-config-contract.ts), con parse estricto.
  - Identidad siempre del Bearer; nunca userId del cliente; sin service_role en el camino del cliente.
- Sugerencia de objetivo por tipo (para el paso 4): devolvé en el GET, si hay gasto calculado, una sugerencia por tipo (mantenimiento = gasto; déficit y superávit con un porcentaje documentado y conservador). Es solo sugerencia: nunca se guarda sola.
- Compatibilidad: la config actual de Mobile (operation 'plan') y la Web siguen guardando el período de hoy sin tipo; leer stage_kind null como "Plan" sin tipo. No toques day_logs ni recalcules días pasados.

Tests (vitest en el servidor):
- Programar una secuencia de 3 etapas: fechas encadenadas bien (incluye meses de distinta longitud y cambio de año), "al terminar → mantenimiento" agrega el período final.
- El motor del día toma la etapa programada al llegar su fecha (simulá el "hoy").
- No se puede editar ni borrar una etapa que ya empezó; sí una futura.
- replace_from_today con future_stages 'keep' y 'cancel'.
- CAS: escritura con listVersion vieja → conflict con la verdad; misma idempotencyKey → mismo resultado sin duplicar.
- RLS: un usuario no ve ni toca etapas de otro.
- La config actual (save_nutrition_plan_v2) sigue funcionando igual.

Migración: creá el archivo y probala localmente (o en una branch de Supabase si podés), pero NO la apliques a producción: la aplico yo después de revisarla. Validá con los tests del servidor que toques y `npm run validate` en apps/mobile si tocás contratos compartidos.

En la descripción del PR: el modelo elegido, las decisiones abiertas que resolviste (unidad de duración, endsOn, borrar en el medio de una secuencia) y cualquier riesgo para los días pasados. No commit/push/PR hasta que se pida.
```

---

## Prompt · Paso 3 · Ajustes editorial + Perfil + Energía + Datos físicos

```
Paso 3 de "Cuenta, Ajustes y entrada": Ajustes editorial (AJ-A) con Perfil, Energía y Datos físicos. Sin backend nuevo.

Rama: ya existe `codex/ajustes-editorial` (sale de main) con un cambio sin commitear en apps/mobile/app/_layout.tsx que hizo Claude: el splash nativo se mantiene hasta que se resuelve la sesión y se va con fundido (evita el flash claro → entrada oscura → Inicio). Revisalo e incluilo en este PR. No toques bocetos/ (está modificado localmente, no es de este paso).

Leé: bocetos/ajustes/PLAN.md (rondas 1–3 y decisiones), los PNG R2-AJ-A-editorial, AJ2-perfil, AJ5-energia, AJ6-datos-fisicos, R3-ET3 (para el lenguaje de etapas), IDENTIDAD.md y tokens.ts.
OJO: AJ5 y AJ6 se dibujaron en la ronda 1 con tarjetas blancas; el usuario las descartó. Tomá de ahí el CONTENIDO (qué se muestra y cómo se edita) y llevalo al estilo editorial de AJ-A: titular grande, contenido directo sobre el fondo con el resplandor, renglones con línea fina, dato en champagne. Nada de tarjetas blancas ni íconos en cajitas.

1. Ajustes (inicio, apps/mobile/src/settings/settings-screen.tsx)
- Arriba "AJUSTES" chico y un titular con tu momento, armado con datos reales:
  - Con una etapa en curso con duración (GET /api/mobile/v1/nutrition/stages, contrato en src/lib/mobile-api/nutrition-stages-contract.ts y docs/mobile/nutrition-stages-api.md): "Nacho, vas por la semana 3 de 12 de tu déficit." + barra de avance champagne + "Desde 29 sep · 1.900 kcal" / "Termina 21 dic".
  - Etapa sin fin: "Nacho, tu plan de mantenimiento rige desde el 29 sep." sin barra.
  - Sin plan o sin datos: titular neutro con el nombre ("Hola, Nacho."). Nunca inventar semanas ni números. Si la lectura de etapas falla, el titular cae al neutro sin error a la vista (el resto de Ajustes funciona igual).
  - Avatar arriba a la derecha: foto de la cuenta (user_metadata de Google: avatar_url/picture) o la inicial; lleva a Cuenta.
- Renglones grandes (título + resumen en champagne + flecha): Plan (tipo · kcal de hoy), Energía (gasto por día), Cuerpo/Datos físicos (altura · último peso), Métricas (nombres activas), App (tema · vibración), Cuenta (proveedor · email).
- Pie: "OWNLEVEL 1.0 (12)" con la versión real, Diagnóstico accesible desde ahí (tocar la versión o un renglón chico, proponé), y "Privacidad" solo si existe una URL pública en el código; si no, no muestres un link muerto.
- Carga: el titular y los resúmenes salen del caché si existe y se refrescan sin saltos; si no hay nada, esqueletos con la forma final de cada renglón. Los números que cambian cuentan hasta el valor nuevo.
- Entrada con el texto y renglones apareciendo en cascada corta (200 ms, escalonado chico); Reducir movimiento = fundido.

2. Cuenta / Perfil (AJ2)
- Foto (o inicial), nombre editable EN EL LUGAR (tocar → campo → "Listo"), email y "Entrás con Google" de solo lectura. Cerrar sesión acá, con confirmación nativa.
- Usá el controller de nombre que ya existe (src/settings/display-name-controller.ts) pero sin su jerga: nada de "borrador", "intento", "lectura". Guardando = el botón se vuelve indicador y después ✓; conflicto = "Cambiaste el nombre en otro lado. Quedó «X»." con opción de volver a escribirlo.
- App: tema (Sistema/Claro/Oscuro) y vibración, en su propia pantalla corta o en Cuenta, proponé lo más limpio.

3. Energía (AJ5, en estilo editorial)
- Automática / La pongo yo (control segmentado nativo).
- Número grande "Gastás por día 2.350 kcal" con la cuenta a la vista: En reposo (BMR) + Actividad cotidiana (+470). Sale de los datos que ya trae la configuración (bmrKcal, automaticBaseKcal, usedBaseKcal). Si falta algún dato físico, en vez del número: "Para calcularlo necesitamos tu altura, peso y nacimiento" con link a Datos físicos. Missing ≠ 0.
- Actividad con ejemplos de la vida real, no low/moderate/high: Poco movimiento (trabajo sentado, poco caminar) · Algo de movimiento (de pie o caminando parte del día) · Mucho movimiento (trabajo físico o todo el día en movimiento). Elegir una actualiza el número con el conteo animado (estimado local mientras guarda, el del servidor manda al confirmar).
- "La pongo yo" cambia el número grande por un campo.
- "Si entrenás, gastás +200 kcal" como renglón aparte editable.

4. Datos físicos (AJ6, en estilo editorial)
- Cada dato se toca y abre su control nativo en el lugar: nacimiento con DatePicker nativo, altura con rueda (@expo/ui Picker wheel, como month-wheel.ios.tsx), sexo en palabras (Hombre / Mujer / Otro; sin dato = ninguno marcado, nunca "male").
- Peso: si hay historial, se muestra el último con su fecha ("Último registro: 3 oct") y se cambia en Cuerpo (link); si no hay ninguno, se carga acá como hoy (mismo comportamiento que el editor actual).
- Abajo: "Se usan para estimar cuánto gastás en reposo (Energía). No se muestran a nadie."

Reglas de escritura (importante)
- Energía y Datos físicos guardan con el ConfigurationController que ya existe (src/nutrition/config-controller.ts, provider compartido): mismas escrituras, mismo CAS, misma intención durable, mismos conflictos. Cambiá la UI, no la semántica. Los estados uncertain/conflict/blocked se explican en criollo y con una sola acción clara.
- Estas pantallas van como rutas del stack de Ajustes (app/settings/...), con gesto de volver nativo. Nutrición › ··· › Energía / Datos físicos abre estas mismas pantallas.
- El Plan nutricional NO se rediseña en este paso (es el paso 4, con etapas): el renglón Plan sigue abriendo el editor actual, pero sacale ya los textos técnicos ("Plan V2 vigente", "Configuración heredada. Guardar adopta V2…", "BMR", "Base usada guardada", "Comprobar intento guardado", "Revisar mi borrador con esta versión", "Cerrar · conservar intento") por equivalentes en voseo.

Tests: titular con etapa con duración / sin fin / sin plan / lectura fallida; actividad en palabras; sexo sin dato; peso con y sin historial; que Energía y Datos físicos usen las mismas escrituras del controller; splash (que no se oculte en BOOTSTRAPPING y sí al resolverse).
Proponé en la descripción del PR los toques extra que veas (no los implementes si cambian comportamiento).
Al final: npm run validate en apps/mobile. Después commit selectivo, push y PR contra main (esta vez sí se pide), y avisá el número.
```

---

## Prompt · Paso 4 · Etapas en Ajustes + plan por día

```
Paso 4 de "Cuenta, Ajustes y entrada": etapas del plan (ET1, ET3, ET4) y plan por día (AJ3, AJ4) en Mobile, sobre la API del paso 2 (ya en producción). Sin backend nuevo.

Partí de main actualizado (incluye #255 y el arreglo de Metro #256), rama nueva `codex/etapas-plan`. No toques bocetos/.

Leé: docs/mobile/nutrition-stages-api.md (contrato, operaciones, errores, fechas: endsOn EXCLUSIVO, Córdoba), src/lib/mobile-api/nutrition-stages-contract.ts, apps/mobile/src/api/nutrition-stages.ts (ya hay lectura), bocetos/ajustes/PLAN.md ronda 3, los PNG R2-ET1-etapas, R3-ET3-cambiar-el-plan, R3-ET4-programar-etapas, AJ3-plan-nutricional, AJ4-cambiar-un-dia, y las pantallas del paso 3 (src/settings/editorial.tsx, configuration-screen.tsx) para seguir el mismo lenguaje visual.
OJO: AJ3 y AJ4 son de la ronda 1 (tarjetas blancas). Tomá el contenido y llevalo al estilo editorial del paso 3. ET1/ET3/ET4 ya están en ese estilo.

1. Etapas (ET1) · lo que abre el renglón Plan de Ajustes y Nutrición › ··· › Plan
- "Etapas" + bajada. AHORA: nombre, kcal de hoy grande, fechas (fin = endsOn − 1 día), "semana 3 de 12" y proteína, barra de avance (misma cuenta que el titular de Ajustes; reusá settings-model). PRÓXIMAS por inicio. ANTES (hasta 24) con tipo, rango y duración; nunca editables.
- Etapa sin tipo (kind null, planes viejos) = "Plan" con su nombre real.
- Tocar la actual → AJ3 para ajustar el plan de hoy. Tocar una próxima → editarla (update_future) o borrarla (delete_future). Si es parte de una secuencia, "Cortar secuencia" (cancel_sequence) explicando que lo vivido y la actual quedan.
- Deslizar una pasada → "Duplicar": abre Cambiar desde hoy o Programar (que elija) prellenado con sus valores. Es solo prellenado en el cliente.
- "+" arriba → ET3.
- Colores por tipo para los tramos: superávit champagne claro, déficit champagne oscuro, mantenimiento gris, recomposición/propio gris medio. Siempre con el nombre del tipo escrito al lado; el color nunca juzga.

2. ¿Qué querés hacer ahora? (ET3)
- "Ahora: Déficit · 1.900 kcal · desde 29 sep".
- Cambiar desde hoy → AJ3 en modo etapa nueva (tipo + nombre + objetivos) → replace_from_today. Si hay etapas programadas, preguntá antes de guardar: "Tenés etapas programadas desde el 22 dic. ¿Las mantenés?" (Mantener → future_stages 'keep' · Cancelarlas → 'cancel'). Nunca se decide en silencio.
- Programar etapas → ET4 vacío.
- Planes típicos (arman ET4 prellenado): Volumen y definición (3 meses superávit · 2 déficit · 1 mantenimiento), Recomposición (6 meses cerca de tu gasto), Definir para el verano (3 meses déficit · 1 mantenimiento). Barrita proporcional con los colores por tipo.

3. Programar etapas (ET4)
- Regla de tiempo vertical: cada tramo con tipo (se cambia tocándolo), fechas "16 oct → 15 ene" calculadas en el cliente con la MISMA regla del servidor (semanas = 7 días; meses con ajuste al último día válido; encadenadas; fin mostrado = siguiente inicio − 1), stepper − / + de duración (semanas o meses, límites del contrato), kcal sugeridas a la derecha. Tocar el tramo abre AJ3 para ajustar sus 7 días.
- Arriba a la derecha: "6 meses · hasta 16 abr". "+ Agregar etapa" (hasta 24). Nombre de la secuencia editable (el título).
- "Al terminar": Sigo en la última / Vuelvo a mantenimiento. Con mantenimiento, el tramo final aparece en la regla sin duración ("desde 16 abr") con sus objetivos explícitos (maintenanceStage), prellenados y editables.
- Inicio: "Empezar hoy" o elegir otra fecha futura (DatePicker nativo). Si ya hay etapas programadas desde esa fecha, el servidor rechaza: avisalo ANTES con la fecha y ofrecé ir a cortar esa secuencia; no hagas dos escrituras encadenadas en silencio.
- Animación: al cambiar una duración, los tramos de abajo se reacomodan con resorte suave y las fechas cambian con fundido; los totales cuentan hasta el valor nuevo.

4. Sugerencias y prellenado (nada inventado)
- kcal sugeridas desde `suggestions` del GET (mantenimiento 100 %, déficit 90 %, superávit 105 %). Recomposición y propio: prellená con el valor de mantenimiento como punto de partida, marcado como sugerido.
- Proteína, agua y extras: copiá los del plan actual; si no hay, vacíos para que los complete. Nunca un 0 inventado; missing ≠ 0.
- Sin `suggestions` (falta el gasto): copiá las kcal del plan actual y mostrá en una línea "Para sugerirte calorías necesitamos tus datos físicos" con link a Datos físicos.
- Lo sugerido se ve distinto (gris "sugerido") hasta que el usuario lo toca o confirma; al guardar se manda lo que está en pantalla.

5. Plan por día (AJ3 + AJ4)
- Semana en 7 columnas L M X J V S D (ISO 1–7): altura proporcional a las kcal reales, kcal arriba, proteína abajo, hoy marcado. Un día sin dato no tiene barra: "—", nunca una barra en cero.
- "Igual todos los días": interruptor que colapsa las 7 en una (al activarlo, toma el valor del día más repetido y lo avisa en una línea).
- Tocar un día → hoja AppSheet (AJ4): calorías y proteína grandes con el teclado numérico, "Aplicar también a" con chips de días y la frase de resultado ("Sábado y domingo quedan en 2.200 kcal · 120 g."). ✓ vuelve al plan; nada se guarda hasta "Guardar".
- Agua por día y "Si entrenás: +300 kcal · +0,5 L" como renglones editoriales editables.
- Guardar: en el plan de hoy = replace_from_today (future 'keep' salvo que el usuario elija otra cosa, conservando tipo y nombre); dentro de ET4 = vuelve a la regla sin escribir; en una próxima = update_future.

Escrituras (importante)
- Solo POST /api/mobile/v1/nutrition/stages. Desde Mobile el plan ya no se guarda por el editor viejo (operación 'plan' de configuración): retirá ese camino de Ajustes y Nutrición; Energía y Datos físicos siguen con su controller.
- Mismas garantías que configuración: clave de idempotencia creada una vez por intento y guardada en el dispositivo ANTES de enviar (patrón de src/nutrition/config-storage.ts, por usuario); resultado incierto = "Tu cambio sigue acá. Comprobá si se guardó" que reenvía el MISMO intento con la MISMA clave; nunca reintento automático ciego.
- 409 STAGES_CHANGED: mostrá la lista del servidor y conservá lo que armaste para revisar. STAGES_DAY_CHANGED: "Cambió el día. Revisá desde cuándo empieza." con el borrador intacto. 400: el mensaje del servidor tal cual.
- Al confirmar: actualizá Etapas, el titular de Ajustes y los objetivos de hoy en Inicio/Nutrición (invalidá los cachés de día y reporte como hace la configuración). El ✓ del botón y el toast de vidrio ("Plan guardado desde hoy." / "Programaste 3 etapas.").
- Conocido, no lo arregles: un guardado desde la Web en el día de inicio de una secuencia desvincula la etapa de hoy (vuelve a "Plan"). Solo mostralo bien.

Carga y movimiento
- Etapas abre con el último dato en memoria y refresca; si no hay nada, esqueletos con la forma final (AHORA, una próxima, dos de antes). Nunca "no tenés etapas" mientras carga; si la lectura falla, aviso neutro con Reintentar (empty ≠ unavailable).
- Entrada en cascada corta como Ajustes; la barra de avance se llena una vez al entrar. Reducir movimiento = fundidos.

Tests: fechas encadenadas (semanas, meses con fin de mes, fin exclusivo); prellenado con y sin sugerencias; recomposición sin sugerencia; día sin dato ≠ 0; aplicar a varios días; keep/cancel explícito; aviso de etapas existentes antes de programar; incierto conserva la clave; 409 conserva el borrador; borrar en el medio muestra el mensaje del servidor; etapa sin tipo = "Plan"; caché por usuario.
Proponé en la descripción del PR los toques extra que veas (no los implementes si cambian comportamiento).
Al final: npm run validate y npx expo export --platform ios en apps/mobile. Después commit selectivo, push y PR contra main, y avisá el número.
```

---

## Prompt · Paso 5 · Métricas: ícono, orden y carga rápida

```
Paso 5 de "Cuenta, Ajustes y entrada": métricas con ícono propio, orden arrastrando y carga rápida (M4, M5, AJ8, AJ9). Lleva EXPAND con migración.

Partí de main actualizado, rama nueva `codex/metricas-icono-orden`. No toques bocetos/.

Leé: los PNG bocetos/nutricion/13-M4-ajustes-metricas, 14-M5-editor-metrica, bocetos/ajustes/AJ8-metricas-ordenar, AJ9-carga-rapida; src/lib/mobile-api/metric-definitions-contract.ts y metric-definitions-server.ts; apps/mobile/src/metrics/ (definitions-controller ya tiene `reorder` con CAS por `expectedMetricIds`); apps/mobile/src/home/home-metric-icons.ts; la carga de métricas de Nutrición/Inicio (src/nutrition/metric-entry-sheet.tsx, src/home/use-home-metric-entry) con su deshacer.
OJO: M4 y AJ8 están dibujados con tarjetas blancas: llevá la lista al estilo editorial de Ajustes (pasos 3 y 4). El editor M5 es una hoja AppSheet; ahí la grilla de íconos sí puede tener sus celdas.

Lo que ya existe y NO necesita servidor
- Orden: `user_metrics.sort_order` y la operación `reorder` con CAS ya existen. Es solo la interacción nueva.

EXPAND (migración nueva, NO la apliques a producción)
- `user_metrics.icon text null`: clave de un set cuidado (ej. water, footprints, moon, mug, book, dumbbell, bike, heart, pill, apple, brain, sun, bed, activity, timer, smile, leaf, no-smoking). Check de formato (`^[a-z][a-z0-9-]{0,31}$`), no una lista cerrada en la base, así sumar íconos no pide otra migración. null = el ícono por defecto de hoy (por systemKey, si no `activity`). Si la app no conoce una clave, usa el de por defecto.
- `user_metrics.quick_value numeric null`: la porción de la carga rápida. > 0, con las mismas reglas que el objetivo para su tipo (entero / decimal con 4 decimales / duración en minutos enteros). null = sin carga rápida.
- Se editan con la misma mutación de definiciones (mismo CAS por updatedAt, misma idempotencia y recibos). Íconos y carga rápida se pueden cambiar también en las métricas del sistema (Agua, Pasos…): son presentación, no cambian qué se mide.
- Compatibilidad (importante): los parsers actuales son estrictos con las claves. Un intent viejo de 4 campos tiene que seguir funcionando y conservar icon/quick_value. Una respuesta con claves nuevas no puede romper una build instalada que no las conoce. Proponé y documentá el mecanismo (por ejemplo, campos nuevos solo cuando el cliente los pide) en vez de agregarlos a ciegas. Lo mismo para cualquier otra lectura que devuelva definiciones (Inicio, día de Nutrición, daily-metrics).
- Revisá que los guardados de métricas de la Web (src/lib/daily-metrics/server.ts) no borren icon ni quick_value.
- Wrapper `security invoker` en public y lógica en ownlevel_private como en los pasos anteriores; RLS por dueño; tests de contrato y de Postgres.

1. Lista de métricas (M4 + AJ8)
- Editorial: "Métricas" + "Lo que querés registrar cada día. Aparecen en Inicio y en Nutrición, en este orden." Renglones con su ícono (muted), nombre, "Decimal · L · objetivo 2,5" y la carga rápida si tiene ("toque: + 250 ml"). Archivadas al final, en su renglón.
- Mantener apretado y arrastrar: la fila se levanta (escala 1,02 y sombra), las demás se corren con resorte suave, toque háptico al levantar y al soltar. Al soltar se guarda con el `reorder` existente (una escritura por soltada, con el orden que viste como CAS). Mientras guarda, la lista queda en el orden nuevo con un indicador sutil. Si hay conflicto, vuelve al orden del servidor con un aviso corto.
- VoiceOver: acciones "Mover arriba" / "Mover abajo".
- El orden manda en Inicio y en Nutrición (verificalo).

2. Editor (M5 + AJ9), hoja AppSheet
- Vista previa arriba: el círculo como se ve en Inicio, con el ícono, el nombre y debajo "+ 10 páginas" o "Cargar". Se actualiza en vivo.
- Nombre, grilla de íconos (SF Symbols en iOS, Lucide en Android, mismo set de claves, tamaño 20, seleccionado con fondo champagne suave), "Se registra como" (no editable si ya tiene registros; explicalo en una línea), unidad, objetivo diario y "Carga rápida" con su porción en la unidad de la métrica (duración en h/min).
- Archivar y eliminar en el ··· de la hoja, con las reglas que ya da el servidor (`actions`).

3. Carga rápida en Inicio
- Con porción: tocar el círculo suma la porción al valor de hoy. El aro avanza con el número contando, toque háptico suave y el toast de vidrio "Agua: 1,75 L · Deshacer". Mantener apretado abre la carga completa de hoy. Sin porción, el toque abre la carga como hoy.
- Escritura: la MISMA que usa la hoja de métricas (su CAS, su idempotencia, su manejo de incierto/conflicto). El valor nuevo se calcula sobre el valor del servidor que tenés en pantalla y va con su versión esperada; si cambió, conflicto, se relee y se avisa sin sumar dos veces. Nunca dos toques rápidos se pierden ni se duplican: encolalos o bloqueá el círculo mientras guarda (con indicador en el aro), proponé lo mejor.
- Deshacer vuelve al valor anterior exacto; si antes no había valor, lo borra (missing ≠ 0, nunca deja un 0).
- Si hoy no tiene valor, el primer toque crea el valor = porción.
- Proponé si conviene lo mismo en los círculos de Nutrición › Tu día.

Rollout
- Cuando valide, frená y avisá: Claude aplica la migración a producción. Recién después commit selectivo, push y PR contra main (la API se despliega al mergear, la migración tiene que estar antes).

Tests: intent viejo conserva icon/quick_value; build vieja no se rompe con la respuesta; reglas de quick_value por tipo; clave de ícono desconocida usa el de por defecto; reorder al soltar con CAS y conflicto; carga rápida crea / suma / deshace a vacío / conflicto sin doble suma; toques seguidos; VoiceOver mover arriba/abajo.
Proponé en la descripción del PR los toques extra que veas (no los implementes si cambian comportamiento).
Validá: npm run validate y npx expo export --platform ios en apps/mobile, más los tests del servidor que toques.
```
