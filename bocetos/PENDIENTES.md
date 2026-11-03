# Pendientes del rediseño (M9)

Lista viva de lo que sacamos de una pantalla para llevarlo a otra, y de los cambios de servidor que fueron apareciendo. Se actualiza en cada sesión de bocetos. Bocetos: `bocetos/bocetos.entrenar.pen`.

## Estado conciliado · 21/10/2026

Contrastado con el código y los PRs mergeados hasta **#301**, y con Notion › M9. M0–M8 siguen cerrados; M9 tiene la implementación visual y las revisiones recientes, pero no se cierra sin QA físico. Las secciones con fecha conservan decisiones anteriores; la segunda vuelta del 21/10 reemplaza los detalles de la primera donde se indique.

Lo que sigue abierto:
- **Uso personal sin Metro:** firmar, instalar y validar OWNLEVEL Diario con el código actualizado. La variante está implementada (#300); la build sin firma pasó, la cuenta Apple se recuperó y Dev se firmó en iPhone. Diario todavía no se instaló ni se probó con la Mac apagada. Guía: `docs/mobile/ios-daily-release.md`.
- **QA físico:** cambios recientes de Progreso/Cuerpo, hojas y teclado, Ajustes/etapas, final de sesión, haptics, accesibilidad y gestos de Nutrición. Compilar, tests o merge no lo aprueban.
- **Polish pendiente:** decidir la carga rápida de métricas en Tu día y si vuelven las sugerencias Para vos. Las franjas de etapas en Nutrición están implementadas localmente (21/10), con QA físico pendiente.
- **Producto diferido:** primera vez guiada; Qué influye con fuerza, peso y energía; aviso automático basado en Lo que se movió junto; decisiones sobre comidas externas y duplicados rápidos.
- **Cierre técnico:** dos tests de raíz siguen fallando (ver ROADMAP), lint por revalidar y CONTRACT de rutas anteriores conservando los links históricos.
- **Distribución pública y Web:** Apple/mail, identidad pública, seguridad, privacidad de tienda y TestFlight/App Store siguen su gate propio. Módulos y suplementos son propuestas con alcance por decidir, no requisitos nuevos para instalar Diario. Detalle: `bocetos/ROADMAP.md`.

## Va a Ajustes (se diseña en la etapa Cuenta y Ajustes: `bocetos/ajustes/PLAN.md`)

- ~~**Plan nutricional, Energía y Datos físicos en Ajustes:**~~ HECHO (16/10, PRs #255 y #257): Ajustes editorial, Energía y Datos físicos sin jerga (#255); plan por día, agua y extras dentro de Etapas (#257). Nutrición › `•••` abre las mismas pantallas.
- ~~**Métricas:** crear, editar, archivar, eliminar y reordenar, **con ícono** (bocetos M4 y M5).~~ HECHO (16/10, PR #258, migración `20261016180618_metric_presentation_expand`): ícono, arrastrar para ordenar y carga rápida en Inicio. Pendiente proponer la carga rápida en Nutrición › Tu día.
  - La administración vive en Ajustes › Métricas. Progreso › Métricas muestra tendencias y ya no ofrece cargar/corregir (#301).
  - El orden es el que se ve en Inicio y en Nutrición.
- ~~**Porción configurable y carga rápida por métrica:**~~ HECHO (#258): se configura en el editor; un toque en Inicio suma esa porción y mantener apretado abre la carga completa. #297 agregó el pequeño "+" en el círculo. El rótulo completo "+ 250 ml" era una propuesta visual: no se presenta como implementado ni requiere otro EXPAND para configurar la porción.
- Vibración: ya está en Ajustes (M9.1C).

## Va a Progreso (cuando lo diseñemos)

- ~~**Reporte nutricional:**~~ HECHO (15/10, Progreso paso 5): Nutrición tiene su pantalla propia en Progreso, con el período y la comparación compartidos. Inicio, el resumen y el calendario abren esa pantalla; se retiró "Reporte" del `•••` de Nutrición.
  - CONTRACT pendiente: la ruta `/(tabs)/nutrition/reports` sigue viva para links anteriores, sin entradas desde la app. Retirarla en una etapa posterior.
- ~~**Análisis grande por ejercicio:**~~ HECHO en Progreso › Entrenamiento y el detalle por ejercicio (#233–#240; revisado en #300–#301). El historial conserva su función de registros.
- ~~**Tendencias de métricas y nutrición:**~~ HECHO (#240 y Progreso paso 5; revisado en #300–#301), con períodos, objetivos y comparación.
- **Bocetos de Progreso hechos (15/10, `bocetos/progreso/`, P1–P6):** el reporte nutricional pasa a P4 y el análisis por ejercicio a P3. "Reporte" ya se retiró del `•••` al implementar Progreso paso 5 (R5/R6).

### Se va de Progreso (bocetos P1–P6)
- **Accesos duplicados del primer boceto ("Explorar" / "Revisar datos"):** se retiraron. El Explorar actual sí está implementado como capacidad propia junto con Mis vistas (#241–#244); no está descartado.
- **Historial:** vive en Entrenar.
  - Decisión (15/10): no tiene entrada propia. Entrenar y Nutrición tienen su historial y calendario; `/history/day/[date]` se usa como vista de un día desde los gráficos de Progreso.
- **"Métricas diarias" (cargar y editar el día):** la carga de hoy ya está en Nutrición › "Tu día". La edición de días pasados va con el editor de Nutrición, y "Administrar métricas" va a Ajustes.
- ~~**Selector de período de 7 chips.**~~ HECHO: Semana, Mes, 3 meses, 6 meses, Año y Personalizado, con comparación opcional.

## Queda en su sección, pero dentro de un menú

- **Nutrición › `•••`:** Comidas guardadas, Alimentos y accesos al plan, Energía y Datos físicos. Estos últimos abren las mismas pantallas de Ajustes; ya no esperan otra implementación allí (#257, #284).

## Nutrición · decisiones del 16/10 (PR #252)

- **Calendario de Nutrición:** sin "Promedio del mes" ni "Ver reporte"; los dos viven en Progreso › Nutrición.
- **Rápido:** muestra solo las guardadas. "Para vos" (sugerencias) sigue construido, oculto detrás de la prop `suggestions`. Decidir si vuelve y cómo.
- **Semana de Nutrición:** solo iniciales del día, sin número.

## Se sacó (decisión tomada)

- "Restaurar plan inicial" de rutinas, en Mobile. El endpoint y la Web quedan como están.
- Valores por defecto del ejercicio (series, reps, peso, RIR, descanso) en Mobile: el ejercicio es solo "qué es". La base no se toca.
- Página "Por día" de "Esta semana" en Inicio: la reemplaza "Hábitos".

## Entrada y cuenta (16/10)

- **Entrar con Apple:** botón ya visible en la entrada (EN-C), sin funcionar. Falta: proveedor Apple en Supabase, capability en Apple Developer (lo hace el usuario), `expo-apple-authentication` y rebuild. App Store lo exige si hay Google.
- **Entrar con tu mail:** botón visible, sin funcionar. Decidir: enlace mágico o código por mail (Supabase OTP).
- **Passkey:** botón visible, sin funcionar. Falta elegir una solución/proveedor compatible, verificar el soporte actual de Supabase y definir el dominio asociado. Esta revisión no certifica disponibilidad ni estabilidad externa.
- ~~**Eliminar cuenta:**~~ HECHO (16/10, migración `20261016181514_account_deletion_expand`): AJ7 en Cuenta, borra todo (Mobile y Web) en una transacción. El botón de la Web está en Ajustes › Cuenta y seguridad (PR de pulido de marca).

## Avisos para el futuro onboarding (19/10, PR #295) · PENDIENTE

El retiro de avisos del editor no implementó una primera vez guiada ni prueba que se muestren una sola vez. Se destinaron al futuro onboarding:
- "Rige desde hoy. Los días anteriores conservan el plan que tenían."
- "Elegí qué tipo de plan es para guardarlo."
- "Calorías sugeridas. Podés ajustarlas antes de guardar."

La validación "Elegí qué tipo de plan es para guardarlo" sigue existiendo al intentar guardar sin tipo; eso es distinto de una introducción. B1–B5 y el estado de primera vez siguen pendientes en `ajustes/PLAN.md` y Notion › Ideas.

## Va a Progreso (etapas, 16/10)

- ~~**Comparar etapas (boceto ET2):**~~ HECHO (16/10, PR #260): sección "Tus etapas" en Progreso que se abre de a poco, renglón propio sin mezclarse con el período, chip "Etapas" en Peso y planes anteriores como etapas de solo lectura. Franjas en Nutrición implementadas localmente el 21/10: chip apagado por defecto, límites por fecha incluso dentro de bloques y etiquetas del período actual; falta QA físico. Bocetos y decisión en `progreso-etapas/PLAN.md`.

## Progreso · lo que se movió junto (17/10)

- ~~**Comida × cuerpo y rendimiento:**~~ HECHO (17/10):
  - **Qué es:** la sección "Lo que se movió junto" dentro de "Tu octubre" y el detalle de cada historia.
  - **Historias:** proteína y fuerza, carbos y fuerza, carbos y energía, calorías y peso.
  - **Comparación:** siempre frente al período anterior equivalente.
  - **PRs:** servidor #274 (sin migración), sección #275 y detalle #276.
  - **Plan:** `conexiones/PLAN.md`.
- **Pendiente: Qué influye con fuerza, peso y energía.**
  - Hoy acepta como resultado solo nutrición, entrenamiento y métricas.
  - Hace falta un EXPAND para sumar el 1RM estimado por ejercicio, la tendencia de peso por semana y la energía al terminar como resultados.
  - Cuando exista, el link "Mirar en Qué influye" del detalle puede preguntar por fuerza o peso, en vez de "series al día siguiente". También puede aparecer en "Calorías y peso", que hoy no tiene link.
- **Pendiente:** que el aviso automático use estas historias.

## Sesión terminada · recién terminás y volver a verla (17/10)

- ~~**Resumen de sesión (SF1, SF2, SF3):**~~ HECHO (17/10):
  - **Servidor:** la lectura `/summary` compara cada ejercicio con la última vez (#277). Si el mejor set empata, decide el total del ejercicio (#278).
  - **Volver a verla:** la frase, los sentimientos en puntos, los músculos y los ejercicios desplegables con su "antes" (#278).
  - **Recién terminás:** después de la animación de guardado se llena la semana, que no queda en la vista; después entra la página con el récord o la mejora (#279).
  - **QA en simulador:** arreglos para letra grande, y el récord ya no queda escondido en la lista plegada (#280).
  - **Plan:** `resumen-sesion/PLAN.md`.
  - **Pulido posterior (#281–#283):** semana secuencial, récord y ejercicios visibles, controles de sesión y transición de guardado por fundido. `restEnd` y `personalRecord` están conectados; falta sentirlos en hardware, no implementarlos de nuevo.
- **Pendiente: QA en el teléfono.**
  - Terminar un entrenamiento real y mirar la secuencia guardado → semana → página, con récord, sin récord y con Reducir movimiento.
  - Sentir el háptico del día que se llena.
  - En el simulador no se pudo probar sin cerrar la sesión en curso.
- **Para pensar después del QA:** la etiqueta "↘ 152 kg en total". Aparece cuando el mejor set empata y el resto bajó. Si se lee pesada, se puede pasar a "↘ volumen", y el detalle queda en el "antes" de cada serie.

## Cambios de servidor pendientes (EXPAND)

- ~~**Plan nutricional en etapas** (16/10):~~ HECHO: servidor/API #254 (migración `20261016121039_nutrition_plan_stages_expand`), pantallas #257 y lectura de Progreso por etapa #260. Franjas de Nutrición implementadas localmente el 21/10, pendientes de QA físico; no requieren otro EXPAND de esa lectura.
- ~~**Extra por entrenar en proteína y agua opcional en el plan:**~~ HECHO (#292 EXPAND, migración `20261020013939`; #293 ADOPT). La v2 suma proteína si hay objetivo; el agua puede tomar el objetivo de la métrica Agua. Los planes anteriores, snapshots y v1 conservan su semántica. Detalle: `docs/mobile/nutrition-training-extra-api.md`.

- ~~**Progreso etapas 3 y 4 · Qué influye y aviso automático:**~~ HECHO (15/10, PRs #245–#249, migración `20261015222727_progress_insight_dismissals_expand`). Plan en `bocetos/que-influye/PLAN.md`.

- ~~**Progreso etapa 2 · Explorar y Mis vistas:**~~ HECHO (15/10, PRs #241–#244, migración `20261015175527_progress_views_expand`). Plan en `bocetos/explorar/PLAN.md`. Sigue la etapa 3 (Qué influye), con bocetos propios.
  - Lectura `GET /progress/explore` (sin migración).
  - Tabla `progress_views` con API de vistas (migración, CAS, idempotencia, máximo 6).

- ~~**Rutinas:** duplicar, reordenar y colores nuevos.~~ HECHO (duplicación, orden versionado y 12 colores).
- ~~**Sesión en curso:** agregar vacío, "Sumar a {RUTINA}", historial por rutina.~~ HECHO (PRs #212–#217).
- ~~**Inicio · Hábitos:** lectura semanal propia.~~ HECHO (PR #222).
- ~~**Historial:** intensidad relativa del calendario.~~ HECHO (rediseño HI1–HI5).
- ~~**Nutrición · "Qué cambia hoy":**~~ HECHO (15/10, M9 paso 5): `breakdown` opcional en la lectura del día, resuelto en TypeScript sin migración. Incluye base, aportes de entrenamiento/trabajo configurados y modo del gasto; solo se publica para hoy si las fuentes pertenecen al usuario, no cambiaron después del snapshot y ambos totales cierran. Los ajustes manuales, históricos sin snapshot de la base, fuentes no disponibles, origen de entrenamiento ambiguo en reglas anteriores y reglas no aditivas devuelven `null`. Queda afuera guardar snapshots de la base para explicar días pasados y descomponer interacciones entre factores; requiere otro EXPAND.
- ~~**Métricas · ícono propio:**~~ HECHO (#258; editor pulido en #297). La definición guarda el ícono elegido; no quedan limitadas a los íconos genéricos/de sistema.
- ~~**Nutrición · momento y hora al cargar:**~~ HECHO (15/10, migración `20261015031555_mobile_meal_timing_expand`): la carga manual y la rápida aceptan `mealLabel` y `consumedAt` opcionales; sin ellos todo queda igual que antes.
- ~~**Nutrición · "Guardar en mis comidas" desde la carga manual:**~~ HECHO (misma migración): registrar y guardar van en una sola operación con una sola clave.
- **Nutrición · aviso de duplicado en la carga rápida (opcional):** hoy solo la carga manual detecta "posible duplicado". La carga rápida (guardadas, sugerencias, alimentos) no; por ahora lo cubre el aviso con "Deshacer".
- **Nutrición · editar y borrar comidas que no se cargaron desde la app:** hoy el servidor solo permite editar o borrar comidas con origen `manual` (incluye las de carga rápida). Las que llegan desde ChatGPT, IA, etiqueta o importadas quedan de solo lectura (`MEAL_UNAVAILABLE`), y tampoco los resúmenes históricos. Decidir si se habilita conservando el origen. Mientras tanto, la app ofrece Repetir y Guardar como comida.
- **Nutrición · Repetir una comida:** se puede hacer hoy creando una comida manual con los mismos valores (se pierde el origen y la precisión). Si se quiere conservar el origen, hace falta una operación de servidor.

- ~~**Progreso · comparación libre.**~~ HECHO: la lectura acepta un rango de comparación explícito.
- ~~**Progreso · "Cuándo comés" (boceto R6):**~~ HECHO (15/10, Progreso paso 5): endpoint aditivo `GET /api/mobile/v1/progress/nutrition/timing`, con identidad por Bearer y lectura paginada bajo RLS, sin migración. Mañana 5–11, Mediodía 11–15, Tarde 15–20 y Noche **20–5** (incluye madrugada), en horario de Córdoba; solo las comidas con hora conocida aportan a las franjas. Menos de 10 comidas con hora no muestra porcentajes.
- ~~**Progreso · lectura de estadísticas general.**~~ HECHO en las etapas 2–4 (Explorar, Mis vistas, Qué influye).

## Decisiones de marca para registrar en IDENTIDAD.md (HECHO 16/10: registradas en Sistema)

- **Registrado:** excepción Tu día, estilo editorial y las cuatro pestañas reales. Referencia vigente: `docs/brand/ownlevel-marca/IDENTIDAD.md`, sección Sistema; no queda una tarea de volver a registrar lo mismo.
- **Pendiente distinto:** completar la decisión canónica sobre la atmósfera global y sus franjas de §9c de `docs/mobile/m9-brand-polish-plan.md`. La mención del resplandor editorial no cierra por sí sola toda esa decisión.

## Web

- Se rediseña al final, con foco en planificar y enseñar a usar la app, no en entrenar. Mientras tanto se aceptan diferencias con Mobile. Por ejemplo: la Web todavía muestra y usa los valores por defecto del ejercicio, y agregar en una sesión desde la Web también va a arrancar vacío.

## Finalizar entrenamiento · QA de plataforma

- F1–F5 y lectura aditiva de volumen/destacados implementados en M9. Contrato y decisiones: `docs/mobile/m9-finish-redesign.md`.
- Repetir QA en iOS 26 y verificar haptics en iPhone físico: esta máquina solo tiene Simulator iOS 27. El módulo de controles requiere rebuild del development client.

## Nutrición · Biblioteca · QA de gestos

- Paso 6 implementado. Listas, búsqueda, filtros, crear/editar, archivar/restaurar, menú nativo del editor y acciones de accesibilidad verificados en Simulator iOS 27, en claro y oscuro. Los registros creados para QA quedaron archivados.
- Repetir en iPhone el gesto físico de mantener apretado y deslizar: el puente de Device Hub de esta sesión rechaza arrastres/coordenadas con `noWindowsAvailable`. La acción de deslizar se probó automáticamente (cierra el gesto y pide confirmación antes de archivar); el menú nativo y las acciones accesibles se probaron en Simulator.

## QA del usuario pendiente (conciliado 21/10)
- **Sesión terminada (17/10):** la secuencia real al guardar un entrenamiento (ver arriba).
- **Progreso:** implementación y revisión de simulador mergeadas hasta #301. Repetir en iPhone Cuerpo/correcciones, hojas/teclado, gráficos, Lo que se movió junto y Tus etapas.
- **Cuenta y Ajustes (pulido #284–#297):** el QA documentado de simulador no cierra gestos físicos, teclado, plan/etapas con datos reales, Deshacer ni accesibilidad hablada. Eliminar cuenta se recorre sin confirmar. El QA de Entrada/Inicio/Entrenar/Nutrición del 16/10 queda como evidencia histórica, no aprobación automática de cambios posteriores.
- **Accesibilidad/plataformas:** texto grande, VoiceOver, Reducir movimiento/transparencia, haptics en iPhone; iOS 26 y regresión Android siguen sin cerrar en este corte.

## Progreso · primera revisión (20/10; ver cambios de la segunda vuelta abajo)

- **Orden nuevo:** Mis vistas → Tu {mes} → Lo destacado → Lo que se movió junto → Más para mirar (aviso automático, Tus etapas, Qué influye).
- **Se movió:** el aviso "Notamos algo en tus datos" sale de Lo destacado a "Más para mirar". Mira los últimos 3 meses, no el período elegido.
- **Se sacó del inicio:** la frase "Pasaron al mismo tiempo: no quiere decir que una cosa cause la otra." Queda en el detalle de cada historia.
- **Se sacó del detalle de Carbos y energía:** el link "Mirar en Qué influye: series al día siguiente". No respondía a la energía. Vuelve cuando Qué influye pueda usar la energía al terminar como resultado (EXPAND, junto con fuerza y peso; ver arriba).
- **Mis vistas:** el desglose se muestra como mini barras con el más alto en champagne, y al lado solo su nombre.
- **Cuerpo (20/10):** cada medida abre su propia pantalla. Antes se cambiaba arriba sin avisar.
  - Se sacó la nota "Un punto por registro, sin completar días vacíos".
  - La línea de tendencia queda solo cuando suma algo: registros que suben y bajan, o solo 2 registros.
  - "Abrir Cuerpo" pasa a llamarse "Cargar o corregir".
- **Entrenamiento (20/10):**
  - Arriba van tres números: días, series y tiempo. Las sesiones y la nota del tiempo bajan a una línea chica.
  - Las barras están en champagne y lo que está en curso va suave. Antes era al revés.
  - El orden nuevo es Récords → Ejercicios → Desglose. Ejercicios reemplaza a "Mejoraron en el período".
  - Cada ejercicio dice su antes → después con unidad ("9 → 10 reps con 60 kg"). Un ejercicio estable dice solo "Estable".
  - El detalle por ejercicio muestra el número y el cambio arriba del gráfico. Los puntos llevan su valor y el nombre largo entra completo.
  - "Abrir historial" pasa a "Historial".
- **Nutrición (20/10):**
  - Arriba van calorías y proteína, cada una con su objetivo, y una sola línea "Promedio de N días con dato, sin contar hoy".
  - Gráfico: la línea del objetivo ahora se ve encima de las barras. La leyenda nombra solo lo que el gráfico muestra (objetivo, hoy, huecos, comparación).
  - El Detalle pasa a "Promedio por día", sin decimales y con signo en las diferencias. El denominador se dice una vez y vuelve a una fila solo si cambia.
  - Se sumó la sección "Tus días". Se sacó "histórico" de las etiquetas: la nota dice que el objetivo y el gasto son los de cada día.
  - Cobertura queda en una línea si no faltan nutrientes; si faltan, solo se listan los que tienen huecos.
  - En Cuándo comés, cada porcentaje va al lado de su barra, con la leyenda arriba.
- **Métricas (20/10):**
  - Las archivadas quedan detrás de un chip "Archivadas (n)", después de las activas.
  - El promedio lleva su objetivo en una línea propia, y los días se escriben "19 de 19".
  - La leyenda va en una línea con lo que el gráfico muestra: objetivo actual, huecos reales (hoy no cuenta como hueco) y "hoy cuenta cuando termina".
  - Mínimo, máximo y mediana van en una fila de tres. La línea del objetivo de los gráficos de barras ahora se ve.
  - Se sacó la nota "Un 0 registrado cuenta; un día sin dato no.": los ceros ya se dibujan distintos de los huecos.
- **Explorar y Mis vistas (20/10):**
  - Una vista abierta desde Mis vistas se reconoce ("Ya está en Mis vistas") y no ofrece fijarse de nuevo hasta que cambia la consulta.
  - Las medidas fijas muestran su nombre al abrir, sin "Cargando…".
  - Debajo del número no se repite la medida si el valor ya la dice ("352 series").
  - La leyenda del desglose en el tiempo nombra solo lo que aparece.
  - Editar vistas: el subtítulo solo aparece si suma algo (por ejemplo "En el tiempo"). El tacho va gris en reposo; el rojo queda para la confirmación.
- **Qué influye (20/10):**
  - Los dos números de cada respuesta llevan su unidad ("sin entrenar: 1,33 L"), también en el aviso automático y en Mis vistas.
  - La respuesta queda así: la frase, las barras y una línea con la diferencia y la evidencia. "Ojo" pasa a una nota final.
  - "Todavía no alcanza" va en una frase con lo que falta registrar, y el botón dice "Ver 3 meses" (no aparece si ya estás en 3 meses o más).
  - En el armador, los textos entran en una línea ("Separar por", "Ese día / Al otro día / A los 2 días"), y "Cómo" aparece recién al elegir la medida.
- **Tus etapas (20/10):**
  - El título se dice una sola vez.
  - Cuando dos etapas se llaman igual, se distinguen por sus fechas, en los chips y en la tabla.
  - "Sin dato" va chico en lugar del número.
  - Con menos de una semana, la duración va en días. La fila "Duró" pasa a "Duración".

## Progreso · segunda vuelta de QA (21/10)

- **Cuerpo, una sola pantalla:**
  - Progreso › Cuerpo tiene los pesajes y mediciones para corregir, y un "+" flotante con Liquid Glass y vibración.
  - El "+" gira a ✕ y las opciones salen hacia arriba sin taparlo.
  - La ruta vieja `/(tabs)/progress/body` redirige ahí; queda solo para un día puntual (desde Historial).
  - CONTRACT diferido: evaluar retirar `ProgressHub`; la ruta anterior todavía atiende el día puntual desde Historial (`date`) y tiene enlaces desde configuración. Migrar/conservar esos usos antes de retirarla.
- **Hojas de carga:**
  - Peso: el número se ve arriba del teclado.
  - Medidas: hoja acotada arriba del teclado, que se cierra deslizando sin saltos. La fecha es nativa en iOS.
- **Entrenamiento y ejercicio:** selector nativo (Liquid Glass). Las barras y puntos se animan a su valor nuevo y los números aparecen con fundido.
- **Progreso:** el indicador de recarga aparece solo al tirar hacia abajo; las recargas automáticas ya no bajan la página. Todas las pantallas dejan espacio bajo la barra de pestañas.
- **Nutrición:**
  - El promedio por día va con barra contra el objetivo y reparto de macros.
  - Se sacó la sección Cobertura: lo que falta se dice en "Días con registro".
  - Los días destacados muestran su valor.
  - "Por semana" y "Día por día" son tablas compactas plegables. "Por semana" no aparece si los bloques son días.
- **Métricas:**
  - Chips con Liquid Glass.
  - Las archivadas van detrás de una línea, en gris y con el ícono de archivo.
  - Se sacó "Cargar o corregir" de **Métricas**: esa pantalla es de tendencias. Cuerpo sí integra correcciones con el mismo `BodyController`; no se creó una escritura nueva.
