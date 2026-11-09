# #367 — Checklist única de QA física

Una sola lista para todo lo que sale de los PR de #367 y de #380. No se duplica por PR: cada descripción enlaza acá. **Nada de esto está aprobado.** Se hace en Diario, cuando se indique, y sin datos de prueba en la cuenta real salvo lo que el flujo normal escriba.

Lo marcado con *requiere migración* solo se puede revisar después de aplicar las migraciones de #387 y #391 y publicar sus PR.

## Común a todas las pantallas

- [ ] **Coincidencias descriptivas:** Entrenar → Insights → Últimos 3 meses → Semanas y días. Seis entradas en orden fijo, también insuficientes: proteína/calorías/carbohidratos previos y última comida registrada, horarios/energía y fatiga post, alimentación semanal/entrenamiento y peso corporal. Abrir grupos y sus excluidos; evidencia de sesiones en páginas de 25 con continuación explícita y regreso a la página/grupo/A/B. Si cambia la revisión, actualizar el resumen antes de mostrar evidencia. Comprobar fechas, cero/faltante, coberturas distintas y rutinas. Métodos completo/parcial separados; referencias fuera del período sin falsa comparación entre grupos. Respuestas durante la sesión/tardías/sin hora separadas. Cambio corporal cero frente a no calculable y semanas recortadas. Evidencia/horarios → Nutrición/Cuerpo → regreso conserva período, semana y grupo; al cambiar revisión se renueva la lectura completa y avisa. Error/reintento, servidor anterior sin proyección y cambio de cuenta sin datos anteriores. Texto grande, nombres largos, VoiceOver expandido/contraído y claro/oscuro. No acreditan una relación ni causa; preparado sin QA física aprobada. Añadido en esta entrega: calorías/carbohidratos previos (kcal/g y corte visible), última comida explícita (hasta 1 h / más de 1–3 h / más de 3–12 h), constantes/grupos vacíos, horas aproximadas o de registro excluidas y medianoche. Una sola opción desplegada; sesiones/días y ventanas solapadas sin independencia supuesta. Calorías no reconstruidas, cero/faltante y tiempo censurado distintos. Volver desde la página de cada opción conserva A/B, período, revisión y grupo; servidor anterior declara lo no disponible. Sin build ni QA física aprobada. Nuevo incremento pendiente: alternar «Resultados del entrenamiento» / «Energía y fatiga» sin nueva lectura; comprobar distribuciones en palabras, cobertura y exclusiones independientes, contexto previo distinto y sesiones con ambas/solo previa/solo post. Ver respuestas anteriores al final, final/+2 h, tardías, sin hora, ilegibles y otra escala. Volver desde evidencia/horarios conserva también el modo y la página; servidor anterior declara campo no disponible. Grupos iguales, constantes y vacíos permanecen visibles. No se resta ni promedia la escala y mostrar previas no equivale a ajustar. Texto grande y VoiceOver. Incremento semanal pendiente: calorías/proteínas/carbohidratos/grasas en orden fijo, entrenamiento/peso y grupos sin lecturas adicionales; corte/unidades visibles y cuatro categorías de días (utilizables/parciales/sin dato/sin comidas). Grupos iguales, vacíos y semanas insuficientes visibles. Completo/parcial por grupo y por semana, sesiones/días/rutinas y referencias externas; peso con fechas de pesajes, elegibilidad de ambas semanas, huecos y cambio cero. Explicación W/cambio que termina en W (solapamiento, sin causa ni anterioridad). Registros → regreso conserva nutriente, resultado, semana/A-B, grupo y revisión; actualización de revisión/cuenta, servidor anterior sin cobertura nueva, texto grande y VoiceOver. Sin build ni QA física aprobada.

- [ ] **Comparar semanas (#367):** Entrenar → Insights → Últimos 3 meses → Semanas y días → Comparar semanas. A/B con fechas explícitas, selección/intercambio locales, borde del trimestre/cambio de año y semanas recortadas; coberturas distintas y cero frente a sin dato. Medianas insuficientes frente a diferencia B−A calculada en cero; distancia entre semanas. Conteos completos/parciales separados, sin interpretarlos como fuerza ni referencia A/B directa; abrir días → sesión/evidencia (incluida referencia fuera de la semana) y comidas/horarios, Nutrición/Cuerpo/métricas → regresar conservando A/B, periodo, revisión y bloque abierto. Energía/fatiga antes/después ordinales y exclusiones visibles; servidor anterior sin previas no inventa ceros. Resumen sin causalidad, error/reintento, cambios de revisión/cuenta, claro/oscuro, texto grande y VoiceOver (fechas, selección y expansión). Preparado en rama, sin QA física aprobada.

- [ ] **Insights contextual desde Entrenar:** terminar → resumen → «Ver contexto y comparación» y regresar al detalle, sin reabrir el recibo; cerrar el resumen y reencontrar el mismo acceso desde la sesión/Historial. Sesión antigua fuera de primera página, sin referencia o sin contexto, lectura fallida/reintento y sesión eliminada. Identidad/fecha correctas; métodos completo/parcial con sus propios conteos, motivos y evidencia por ejercicio; récords separados. Evidencia → regreso y horarios/comidas → Nutrición → regreso conservan selección y avisan si cambió la revisión, sin bucle de pantallas; cambio de cuenta no conserva hechos/acciones anteriores. La comida posterior sigue siendo contexto posterior y desconocido no es cero. Nombres largos, claro/oscuro, texto grande y VoiceOver (acciones anunciadas); finalizar no espera Insights. Preparado en rama, sin QA física aprobada.

- [ ] **#396 — Estado de sesión:** comprobación en cabecera sin banner invasivo; copia local siempre identificada, inspeccionar estado y reintentar. Sin saltos de lista al refrescar. Pendientes sin falsa confirmación; auth, conflicto, almacenamiento, operación incierta y sesión cerrada/removida visibles una vez con recuperación. Wi-Fi/datos, foreground, claro/oscuro, texto grande, VoiceOver, Reducir movimiento. Preparado, sin QA aprobada.
- [ ] **#414 — Ajustes de la fecha:** Tu día termina de cerrar antes de abrir el editor. Fecha completa, automático/manual y restablecer cada campo sin cambiar el otro. Hoja compartida desplazable, teclado numérico, texto grande, VoiceOver, claro/oscuro y Reducir movimiento. Confirmación en curso sin CTA de recuperación; error/conflicto conserva borrador y recibo. Cancelar pide confirmación si corresponde. Preparado, sin QA aprobada.
- [ ] **#401 — Confirmaciones de métricas:** cápsula secundaria con nombre/valor confirmado, Deshacer seguro y sin X; swipe hacia abajo, acciones de accesibilidad/escape y anuncio. Tab bar y scroll siguen accesibles. Guardados seguidos: Anterior conserva otros avisos; la misma métrica retira el CAS viejo indicándolo. Diez segundos visibles por turno, pausa detrás del editor y sin pérdida silenciosa de otro Deshacer. Recuperación real no es éxito descartable. Inicio/Nutrición, claro/oscuro, texto grande, Reducir movimiento; preparado sin QA aprobada.
- [ ] **#400 — Hoja de duración (Sueño):** desde Inicio y desde el día de Nutrición, debajo de «Quedaría en …» solo queda el margen del indicador de inicio, no el alto de la barra de pestañas. Ruedas completas y con su área táctil; Sumar/Reemplazar sin saltos de altura. Pendiente, error, conflicto y recuperación visibles, con scroll solo si no entra. iPhone compacto y grande, claro/oscuro, texto grande abriendo la hoja ya con ese tamaño, VoiceOver. Las métricas con teclado no cambian. Preparado, sin QA aprobada.
- [ ] **#360 — Próxima vez:** sin cambios nuevos; comprobar lo integrado en #379. Abrir, tocar afuera y reabrir rápido sin que se pierda el toque; segundo toque del botón cierra; elegir más peso/reps cierra con animación; «Tomar resultado de hoy» deja el panel abierto. El botón vuelve al estado cerrado al terminar el cierre nativo, también al contraer el ejercicio. Chevron fijo, sin cambio de tamaño; VoiceOver dice expandido/contraído. Claro/oscuro y Reducir transparencia.

- [ ] **#399 — Peso/medidas:** durante guardado y relectura confirmada, el control sigue ocupado, sin «Actualizar lectura» ni nuevo envío. Solo tras fallar la relectura se ofrece recuperar; completar recuperación no repite la mutación. Verificar desde Inicio y Cuerpo, también recibo local/restauración/conflicto. Corrección preparada, sin QA física aprobada.
- [ ] **#436 — Cierre de peso:** después de confirmar y releer, el mismo formulario sale con el teclado y permanece montado hasta terminar el cierre nativo. Crear, editar, recuperar recibo y reabrir; sin salto del número ni nuevo envío durante la salida. Relectura fallida, conflicto y error conservan el borrador/recibo y no disparan cierre. Cuerpo y acceso desde Inicio/fecha, claro/oscuro, VoiceOver, texto grande y Reducir movimiento. Medidas y otras hojas conservan su comportamiento. Preparado, sin QA física aprobada.
- [ ] **#418 — Comidas guardadas:** formulario sin la aclaración de vacío/cero, conservando ambos valores. Durante confirmación/relectura no aparecen controles de recuperación/cierre de intento; ante fallo sí, sin reenviar escrituras confirmadas. Resaltado con espacio interior estable al aparecer/desaparecer, tanto en guardadas como en Alimentos; claro/oscuro, texto grande y VoiceOver. Corrección preparada, sin QA física aprobada.
- [ ] **#435 — Guardado de comidas guardadas:** crear y editar mantienen un único progreso principal en el botón inferior, sin bloque extra ni salto de formulario. Escritura pendiente y catálogo en actualización se distinguen; no aparecen controles de recuperación durante la relectura normal. Fallo real de detalle/lista, resultado incierto, conflicto y almacenamiento conservan sus acciones y el borrador/recibo, sin reenviar una escritura confirmada. Claro/oscuro, VoiceOver, texto grande y teclado. Preparado, sin QA física aprobada.
- [ ] Claro y oscuro, según las paletas de marca.
- [ ] Dynamic Type mayor a 1,3: etiqueta y valor apilados, sin recortes.
- [ ] VoiceOver: el orden tiene sentido, los botones se anuncian y lo expandido se dice.
- [ ] Reducir movimiento: fundidos, sin desplazamientos.
- [ ] Liquid Glass solo en controles: selector, barra, botones flotantes.

## Picker, descanso y Métricas (#380)
- [ ] **Picker:** sesión → Agregar ejercicio, y el mismo picker en el editor de rutinas. Espacio compacto al abrir, filtrar y buscar. Listas corta y larga, estados vacío, carga y error, teclado y safe areas.
- [ ] **Descanso:** abrir, cerrar con la X y deslizar sin iniciar. Rueda, título y superficie salen juntos. Cancelar no inicia el timer. Confirmar otra duración inicia una sola vez.
- [ ] **Barras:** tocar primera, última y otra barra muestra fecha y valor arriba, sin ir a Día. Otro toque quita la selección. Refrescar y cambiar métrica o período la limpian.
- [ ] **Día, semana y mes:** rango y agregado reales, buckets parciales, cobertura, mínimo, máximo, mediana, objetivo y «hoy en curso». Cero, ausencia, duraciones y negativos se distinguen.
- [ ] **Valores largos:** unidades y series largas, sin saltos de altura. Cuerpo y Explorar siguen igual.

## Sensaciones y finish (#383)
- [ ] **Captura:** pre compacto y omitible; post dentro del formulario final. Responder, quitar y omitir. Sin valores por defecto.
- [ ] **Recuperación:** reiniciar y quedarse sin conexión con respuestas pendientes. Corte al finalizar: mismas respuestas y misma operación.
- [ ] **Conflicto:** editar en otro dispositivo y elegir qué conservar. Nada se sobrescribe solo.
- [ ] **Recibo:** el resumen muestra lo agregado a la rutina, también si falla el detalle.
- [ ] **Safari:** dos pestañas en la misma sesión: se excluyen, y un bloqueo rechazado deja un aviso recuperable.

## Insights (#390)
- [ ] **Acceso:** Entrenar → Biblioteca → Insights.
- [ ] **Post-entreno:** «Comparar en Insights» abre esa sesión. Terminar sin tocarlo no carga nada.
- [ ] **Día:** abrirlo, ver sus ejercicios y su contexto, abrir la sesión y volver.
- [ ] **Relación:** «Para mirar con calma», lista, detalle y volver.
- [ ] **Detalle largo:** con más de 60 días: dice «Los últimos 60 de N días», «Ver los N días» y «Mostrar más días». Fluidez con muchos puntos.
- [ ] **Métrica:** desde un día y desde una relación abre esa métrica y ese mes. «Volver a Insights» restaura vista, filtro, relaciones y día, o la relación.
- [ ] **Período compartido:** el enlace cambia el período de Progreso, y al volver la pila conserva tendencias. Decidir si queda así.
- [ ] **Estados:** vacío, nada comparable, faltan días, sin señal, error y reintento, y aviso de «tus datos cambiaron».
- [ ] **Método parcial:** su rótulo y su límite siempre visibles; nunca aparece «consistente». Sin causas en los textos.
- [ ] **Espera:** cuánto tarda abrir con tu historial real. Sin ADOPT, cada vista es una lectura completa.
- [ ] **Nombre:** «Insights» es provisorio.

## Variante del ejercicio (#394 y #395)
Todo esto *requiere la migración de configuración* y, en Mobile, una build.
- [ ] **Mobile, en curso:** en el ejercicio abierto, «Variante · Sin registrar» y «Registrar». La hoja abre vacía, nunca prellenada. Guardar texto, «No aplica» y «Dejar sin registrar».
- [ ] **Mobile, completada:** la sección «Variantes» permite registrar o cambiar, y lo guardado dice «registrada después». Una sesión eliminada no deja editar.
- [ ] **Web, en curso y completada:** el bloque «Variante» bajo la nota de cada ejercicio, con las mismas opciones y los mismos textos que Mobile. Con teclado, Enter guarda.
- [ ] **Como la última vez:** aparece solo con un único valor en la última sesión completada anterior; elegirlo no cambia nada más.
- [ ] **Texto de ayuda:** dice que para compararla hace falta una sesión anterior con la misma variante. No promete una comparación inmediata.
- [ ] **Bloques repetidos:** el mismo ejercicio dos veces en una sesión, con variantes distintas, muestra el aviso en los dos; Insights dice «Se registró de dos formas en la misma sesión».
- [ ] **No bloquea:** sin conexión, entrenar y finalizar siguen igual; la variante queda «sin confirmar» y «Reintentar» repite la misma operación.
- [ ] **Conflicto:** cambiarla en otro dispositivo; esta muestra la guardada y avisa, sin sobrescribir.
- [ ] **Insights:** dos sesiones con la misma variante se comparan en «Comparación completa»; con distintas dice «Se hizo de otra forma que la anterior». Corregir la variante de una sesión completada actualiza la vista.
- [ ] **Texto largo y Dynamic Type:** etiquetas de 80 caracteres sin recortes; VoiceOver y lectores de pantalla en Web leen «Variante de …», con «registrada después» cuando corresponde.

## Sueño con noche declarada y peso corporal
Todo esto *requiere la migración de sueño y peso* y, en Mobile, una build.
- [ ] **Sueño, hoy:** la hoja de Mobile, el editor del día y Hoy en Web dicen «Cuánto dormiste anoche: la noche que terminó esta mañana».
- [ ] **Sueño, otra fecha:** Historial en Web y el editor del día en Mobile, para ayer y para un día anterior, nombran esa mañana y nunca dicen «anoche».
- [ ] **Opcional:** guardar sin sueño no bloquea nada. Borrar sueño no deja un cero en ningún lado.
- [ ] **Insights, sueño:** «Sueño de la noche anterior» explica qué noche usa. Los valores viejos aparecen aparte como «sin noche declarada», con su límite.
- [ ] **Insights, peso:** «Peso corporal de ese día» dice qué peso y de qué fecha, que es contexto del día y que puede coincidir con el tiempo. «Ver tu peso en Cuerpo» abre Cuerpo, y volver regresa a la relación.
- [ ] **Días y exclusiones:** el contexto del día muestra el peso y si el sueño tiene noche declarada. La cobertura dice cuántos días cuentan y cuáles quedaron fuera y por qué.
- [ ] **Corrección:** cambiar el peso o el sueño de un día ya mostrado actualiza la relación al volver a abrirla.
- [ ] **Texto grande, VoiceOver y Reducir movimiento** en esas pantallas.

## Contexto diario completo
Requiere una build de Mobile con `codex/367-day-context`. No requiere migración.
- [ ] **Una sesión:** el día muestra su nombre y horario, «Antes de entrenar» y «Al terminar», y una sola vez «Alimentación registrada ese día» y «Métricas de ese día».
- [ ] **Dos sesiones el mismo día:** aparecen las dos, en el orden en que empezaron, cada una con sus propias sensaciones. Calorías, métricas y peso aparecen una sola vez, no debajo de cada sesión.
- [ ] **Sin horario:** si a una sesión le falta la hora de inicio, dice «Sin horario» y el día dice «No sabemos en qué orden fueron».
- [ ] **Sensaciones:** sin respuestas dice «Sin registrar». Una previa respondida después de empezar lo aclara debajo. Una energía vieja aparece como «registro anterior», nunca como «Al terminar».
- [ ] **Macros:** con una comida sin carbohidratos, el total dice «parcial» y cuántas comidas no tienen el dato. Un cero cargado se ve como 0 g. Un día sin comidas dice «Sin comidas registradas».
- [ ] **Desde el resumen post-entreno:** se abre esa sesión, y entre las sesiones del día se marca «Esta sesión».
- [ ] **Nutrición:** «Ver Nutrición de ese día» abre esa fecha, y «Volver a Insights» vuelve a la misma sesión o al mismo día abierto.
- [ ] **Corrección:** cambiar una comida o una sensación de un día ya mostrado actualiza el contexto al volver, sin mezclar datos viejos y nuevos.
- [ ] **Texto grande, VoiceOver y Reducir movimiento:** las filas se apilan sin cortarse; VoiceOver lee el nombre, el horario y si es la sesión de origen.

## Tendencias de peso entre Insights y Cuerpo
Requiere una build de Mobile con `codex/367-weight-trends`. No requiere migración.
- [ ] **Desde el día:** en el contexto de un día de Insights, «Peso corporal, ese día» abre Cuerpo en el mes de ese día, con el peso arriba.
- [ ] **Desde la relación:** «Ver tu peso en Cuerpo» abre los mismos días de la relación.
- [ ] **Aviso:** abierto desde Insights, Cuerpo dice que el peso de un día no dice si te pesaste antes o después de entrenar. Abierto desde Progreso, no lo dice.
- [ ] **Vuelta:** «Volver a Insights» regresa a la misma sesión, al mismo día abierto o a la misma relación.
- [ ] **Referencias:** el cambio dice desde qué peso y desde qué fecha. Cada punto abre su día en Historial, y volver regresa a Cuerpo.
- [ ] **Sin datos:** un mes sin pesajes dice «Sin registros» y ofrece el último, sin inventar puntos. Un solo pesaje no muestra cambio.
- [ ] **Cero:** un pesaje guardado en 0 kg aparece nombrado con su fecha y con el aviso que corresponde al servidor desplegado. En los pesajes dice «No cuenta: no es un peso».
- [ ] **Texto grande, VoiceOver y Reducir movimiento** en Cuerpo y en esas filas de Insights.

## Después de las migraciones
- [ ] *Requiere migración.* **Hora de comida (#388):** elegir la hora la declara, incluso con el mismo valor. Abrir una edición, mover de día o repetir una comida no declara nada.
- [ ] *Requiere migración.* **Ventana previa (#389):** una comida con hora declarada cuenta; una con reloj automático no.
- [ ] *Requiere migración.* **Reutilización (#392):** volver a una vista sin cambios es inmediato; registrar una comida la actualiza.
- [ ] **ChatGPT:** las migraciones ya están aplicadas. Falta el paso manual de quien administra cada conexión (GPT con Action y conector MCP), con su comprobación: [paso manual](../integrations/chatgpt-nutrition.md#paso-manual-actualizar-las-conexiones-de-chatgpt-367).

## Pesos inválidos e historial completo en Cuerpo
Requiere desplegar `codex/367-body-weight-fixes`. Web sin build; Mobile solo para el formulario. Sin migración.
- [ ] **Cargar 0 kg:** Web (Cuerpo y Ajustes) y Mobile lo rechazan con un mensaje. Vaciar el peso en Ajustes o borrar un pesaje sigue funcionando.
- [ ] **Un 0 kg ya guardado:**
  - Sigue en el historial con «no cuenta: no es un peso».
  - Se puede corregir a un peso real o borrarlo.
  - No aparece en el gráfico ni en el cambio. Web dice cuántos quedaron fuera.
- [ ] **Historial largo:** con más de 1000 pesajes, Cuerpo, Inicio, Etapas y Relaciones muestran los más recientes. El cambio del período usa sus primeros y últimos pesajes reales.
- [ ] **Medidas, historial largo** (`codex/367-body-measurements-history`): con más de 1000 mediciones, Cuerpo, Inicio y Relaciones muestran las más recientes. Una medición marcada para revisión sigue fuera del análisis y contada.

## Resumen factual post-entreno
Requiere una build de Mobile desde `main` (#410). Sin migración.
- [ ] **Al terminar:** el resumen aparece enseguida; no espera ni lee Insights. Si el resumen no carga, el entrenamiento sigue guardado y no se vuelve a terminar.
- [ ] **Marcas del resumen** («récord», «↗», «=»): debajo de «Ejercicios» dice que son frente a la última vez con el mismo modo de carga y que Insights puede leer distinto.
- [ ] **Sensaciones:** «Energía: baja → alta» y «Fatiga: …», sin números ni porcentajes. Sin respuestas dice «Sin respuestas registradas»; una previa tardía lo aclara debajo.
- [ ] **Comparar en Insights:** abre esta sesión. Cada método va por separado con sus conteos («Mezclado» y «Sin comparar» separados), y cada ejercicio comparado dice frente a qué fecha.
- [ ] **Sin comparables:** una sesión con un ejercicio mezclado y otro sin referencia dice «Todavía sin comparaciones», muestra «0 de 2» y las dos filas. Un ejercicio con variante conocida y señales cruzadas aparece en «Comparación completa» aunque haya otro con variante desconocida.
- [ ] **Texto grande, VoiceOver y Reducir movimiento** en el resumen y en esa vista.

## Evidencia de comparación por ejercicio
Requiere una build de Mobile desde `main` (#411) y la API desplegada de `main`. Sin migración.
- [ ] **Abrir:** en Insights, tocar un ejercicio de un día o de una sesión abre «Evidencia». La lista de Insights no hace lecturas nuevas; la evidencia se lee al abrir.
- [ ] **Referencia:** dice frente a qué fecha se comparó y es la misma que mostraba la fila de Insights, no la última sesión. Con otra variante en la sesión anterior, la referencia es la última con la misma.
- [ ] **Señales y series:** «Con 80 kg: 8 → 10 reps» o «A 8 reps: 80 → 85 kg», con flecha y sin color. Todas las series de las dos sesiones aparecen en su unidad (kg, lingotes, reps o s), con el número de serie que tienen en Entrenar; con dos bloques del mismo ejercicio, «Bloque 1 · Serie 2». Las que usó la comparación dicen «En la comparación», las sin completar «Sin completar, no se cuenta» y otras excluidas «No se cuenta». Un dato faltante dice «sin dato», nunca 0.
- [ ] **Mezclado:** con señales cruzadas o con más carga y menos repeticiones explica por qué no es mejora. Nunca dice «Mejoró».
- [ ] **Récord aparte:** la sección de récords está separada del resultado. En el carril parcial dice «Lo más alto con contexto parcial» y aclara que no es un récord; también se muestra el límite del contexto parcial.
- [ ] **Datos cambiados:** con Insights abierto, editar la sesión desde otro dispositivo y abrir el ejercicio. Si cambió la referencia o el resultado, dice «Esta comparación cambió» y ofrece volver; si es la misma, avisa que los datos son los de ahora.
- [ ] **Volver:** el botón atrás vuelve a Insights en el mismo día o sesión. «Abrir esta sesión», «Abrir la sesión de referencia» y «Ver historial de este ejercicio» abren lo suyo.
- [ ] **Sin red:** muestra «Uy, no pudimos leer tus datos» con «Reintentar», nunca una comparación vacía.
- [ ] **Texto grande, VoiceOver y Reducir movimiento:** las filas se apilan sin cortar números; cada serie y señal se lee completa.

## Cómo terminaste: energía y fatiga al terminar
Requiere una build de Mobile con `codex/367-feeling-outcomes` y la API de esa rama. Sin migración.
- [ ] **Abrir:** en Insights, «Cómo terminaste» abre la pantalla con una sola lectura. Insights no lee nada nuevo al abrirse.
- [ ] **Cada sensación por su lado:** «Energía al terminar» y «Fatiga al terminar» en secciones separadas. Ninguna se calcula a partir de la otra.
- [ ] **Por cómo empezaste:** cada fila dice «Antes: alta · N sesiones» y debajo «Al terminar: muy alta 2 · alta 6 …», con palabras de la escala y cantidades. Sin números de la escala, promedios, porcentajes ni puntajes.
- [ ] **Sin previa que sirva:** las sesiones sin respuesta antes, ilegibles, sin hora o respondidas después de empezar van en su propia fila, con el motivo.
- [ ] **Fuera de las cuentas:** las respondidas más de 2 h después de terminar, sin hora, ilegibles, con otra escala o sin respuesta aparecen aparte. La energía del registro anterior se cuenta aparte y no como energía al terminar.
- [ ] **Sin asociaciones:** al pie dice que todavía no se muestra con qué coinciden. No aparece ninguna relación nueva en «Para mirar con calma».
- [ ] **Sin red:** «Uy, no pudimos leer tus datos» con «Reintentar», nunca una pantalla vacía.
- [ ] **Texto grande y VoiceOver:** cada fila se lee completa («Energía alta antes de entrenar: 2 sesiones. Al terminar, energía muy alta 1, alta 1»).

## Alimentación antes del inicio (fase 2)
Requiere una build de Mobile con `codex/367-meal-timing` y la API de esa rama. Sin migración.
- [ ] **Contexto de la sesión:** debajo de «Carbohidratos registrados, 3 h antes» aparecen «Proteína registrada, 3 h antes», «Calorías registradas, 3 h antes» y «Última comida registrada con hora», cada una en su fila, con su unidad (g, kcal, «Hace 2 h 30 min»).
- [ ] **Hora explícita:** una comida cargada con hora elegida cuenta. Una cargada «ahora», sin elegir hora, no cuenta como explícita: la fila dice «Comidas sin hora».
- [ ] **Medianoche:** una comida a las 23:00 con hora cuenta para un entrenamiento a la 1:00 del día siguiente. Si el día anterior tiene una comida sin hora, proteína y calorías dicen «Comidas sin hora». Esa misma comida no cambia un entrenamiento de la tarde.
- [ ] **Faltantes:** sin comidas dice «Sin comidas con hora», nunca 0. Un cero registrado dice «0 g». Una comida sin calorías hace que las calorías digan «Alguna comida sin ese dato», sin calcularlas desde los macros.
- [ ] **Última comida:** sin ninguna con hora en las 12 h previas dice «Ninguna con hora en las 12 h previas», nunca «12 h» ni «ayuno». Con comidas sin hora cerca, lo aclara debajo.
- [ ] **Sin asociaciones nuevas:** «Para mirar con calma» no muestra relaciones de proteína, calorías ni tiempo desde la última comida.
- [ ] **Texto grande y VoiceOver:** las filas se apilan sin cortar los valores y se leen completas.

## Evolución semanal del peso en Cuerpo (fase 3)
Requiere una build de Mobile con `codex/367-body-weekly`. Sin migración ni API nueva.
- [ ] **Dónde:** en Cuerpo → peso, debajo del gráfico, «Semana a semana», con las semanas más nuevas primero.
- [ ] **Semanas:** de lunes a domingo. La semana en curso no aparece. Con un período de un mes, una semana cortada por el inicio del período no aparece como semana, y el pie dice cuántos pesajes quedaron fuera.
- [ ] **Mediana:** con 3 o más pesajes válidos dice «Mediana 80,2 kg» y los días («3 pesajes: lun 12, mié 14, vie 16»). Con menos, «Sin mediana». Un 0 kg guardado no cuenta como pesaje.
- [ ] **Cambio:** «↘ 0,6 kg frente a la semana anterior», sin color ni palabras como «mejor». Dos semanas con la misma mediana dicen «= 0 kg, igual que la semana anterior». Después de una semana vacía o con menos de 3 pesajes dice «No se puede calcular el cambio» y el motivo; nunca «0 kg», «igual» ni «sin cambio», y nunca compara con dos semanas atrás.
- [ ] **Sin juicios ni recomendaciones:** no hay calorías sugeridas, puntaje ni causas.
- [ ] **Texto grande y VoiceOver:** cada semana se lee completa y las filas se apilan sin cortar números.

## Resumen de los últimos tres meses (fase 4)
Requiere una build autorizada de Mobile y la API correspondiente. Los detalles de `codex/367-period-details` siguen sin desplegar ni verificar en teléfono. Sin migración. Las pruebas automatizadas no marcan esta lista como aprobada.
Integración de lectores completada en pila descartable PostgreSQL 17.6/PostgREST 16.5 con el esquema completo y RLS sintético (#421); [resultados y límites](367-detalles-periodo-pr-description.md). No sustituye ninguna casilla de QA física.
- [ ] **Abrir:** en Insights, «Últimos 3 meses» abre el resumen; los detalles solo se leen al abrirlos. Terminar un entrenamiento no lee ninguna de estas vistas. Volver a una vista abierta revalida su lectura completa.
- [ ] **Fechas:** dice el rango exacto («1 ago – 31 oct») y los tres meses. El mes en curso no entra, tampoco el día 1 de un mes.
- [ ] **Resumen escrito:** frases cortas con cifras. Ninguna dice que una cosa explica otra, ni da causas, rangos óptimos o recomendaciones.
- [ ] **Entrenamiento:** «Comparación completa» y «Con contexto parcial» en filas separadas. Las rutinas en orden solo si una terminó antes de la otra; si se alternaron, lo dice.
- [ ] **Sensaciones:** energía y fatiga al terminar en palabras de la escala, cada una con su propia cobertura («respondida en 2 de 3 sesiones; 1 más tarde y 1 sin respuesta»). Una respuesta tardía no aparece como «sin respuesta». Sin promedios ni puntajes.
- [ ] **Comidas:** «Comidas registradas · N de 92 días». Aclara que un día sin comidas no es cero y que es lo registrado.
- [ ] **Peso:** semanas enteras con mediana y cambio, incluidos los pesajes de días sin entrenar. Sin semanas con 3 pesajes, lo dice.
- [ ] **Detalles y vuelta:** «Ver tu peso en Cuerpo» abre los mismos tres meses y «Volver a Insights» vuelve al resumen. «Ver los días en Insights» y «Ver Cómo terminaste» vuelven con atrás.
- [ ] **Estados:** un período sin registros dice «Sin registros en estos tres meses». Sin red: «Uy, no pudimos leer tus datos», nunca vacío.
- [ ] **Texto grande y VoiceOver:** las filas se apilan sin cortar números y se leen completas.
- [ ] **Detalle de sensaciones:** abrir desde el resumen, comprobar las fechas completas y coberturas separadas de energía/fatiga. Válidas, tardías, ausentes, ilegibles, sin hora, anteriores al inicio y otra escala tienen filas distintas; sin promedios ni puntajes. Volver al resumen conserva esas fechas. «Cómo terminaste · todo el historial» sigue siendo independiente.
- [ ] **Detalle de comidas:** fechas en orden reciente, incluidos días sin entrenamiento; cuatro nutrientes por día. Cero conocido se ve como cero, todo faltante como «Sin dato» y dato parcialmente presente como «parcial». Días sin comidas solo en cobertura; no se inventan ceros. Se aclara que no es ingesta completa.
- [ ] **Día y retorno:** resumen → comidas del período → Nutrición en la fecha elegida → «Volver a las comidas del período» → resumen. Conservar fechas y origen también después de cambiar de mes/año; si queda abierto un período anterior, el resumen lo indica.
- [ ] **Revisión y error:** modificar una fuente fuera de la pantalla y volver; se reemplaza la lectura completa, avisando si cambió desde el resumen. Sin red se distingue no disponible de vacío; si queda una lectura anterior, se identifica. Reintentar mantiene las fechas. Cambio de cuenta no conserva cifras de la anterior.
- [ ] **Vacío y cobertura distinta:** sin sesiones pero con comidas, sin comidas pero con sesiones y período totalmente vacío. Cada detalle mantiene su propio denominador, con retorno disponible.
- [ ] **Presentación de detalles:** claro/oscuro, iPhone angosto, texto grande y VoiceOver; fechas, unidades, numeradores y acciones legibles, filas apiladas y última acción fuera de la barra inferior. Sin juicios de color sobre datos personales.

## Contexto temporal de sesión — Mobile (preparado)

Sin build, despliegue ni QA física acreditados. Reglas y checkpoints en [ejecución Mobile](367-ecosistema-mobile-ejecucion.md).
- [ ] Día con una o varias sesiones: abrir «Ver horarios y comidas de estas sesiones»; conservar todas, inicio/final y duración entre horas conocidas. Sin final/inicio, cronología inválida y duración cero son estados distintos. Comprobar fecha/hora de Córdoba, especialmente medianoche y año nuevo.
- [ ] Previas: carbohidratos, proteína, calorías y última comida con hora, sin reconstruir calorías. Ventana/cobertura y motivos visibles; acceder a Nutrición en cada fecha y volver al contexto de origen. La regla legacy de carbohidratos conserva su alcance, aunque difiera de proteína/calorías.
- [ ] Posteriores: `[final, final+3 h)`, cuatro nutrientes y faltantes independientes; cero explícito frente a «Sin dato». Ventana abierta marcada provisional al corte mostrado. Comidas sin hora fiable y resúmenes legacy no se suman como comidas con hora explícita. Las mismas comidas pueden figurar en ventanas solapadas y se aclara que no explican rendimiento previo.
- [ ] Evidencia: muestra acotada con conteo total y acceso a todas sus fechas en Nutrición. Revisiones cambiadas, error con lectura anterior identificada, reintento y cambio de cuenta sin mezclar datos.
- [ ] Claro/oscuro, iPhone compacto, texto grande, VoiceOver y Reducir movimiento; no tapar acciones con la barra inferior. Sin precarga al finalizar o en pestañas que nunca abrieron el detalle.

## Semanas y conexiones del período — Mobile (preparado)

- [ ] Resumen de tres meses → «Recorrer semanas y días», también en un período vacío. Fechas idénticas, semanas vacías visibles y bordes recortados identificados. Cambiar de semana no muestra una nueva carga de red.
- [ ] Conteos completos/parciales separados; energía/fatiga ordinales con exclusiones; alimentación con cero/faltante/parcial y días registrados; peso corporal diario y mediana solo en semanas elegibles. No confundir el peso con cargas de ejercicios.
- [ ] Semana → día histórico → sesión/ejercicio/evidencia y contexto temporal → Nutrición/Cuerpo/métrica → regreso al mismo día/semana. Probar diciembre/enero, varias sesiones y ausencia de entrenamiento. Mantener disponibles los detalles de #421.
- [ ] Modificar una fuente y volver: reemplazo completo de lectura y aviso de revisión; sin red, última lectura identificada o indisponibilidad con reintento. Cambio de cuenta aislado. Claro/oscuro, texto grande, VoiceOver y ancho compacto sin recortar cifras o acciones.


## Precarga útil de Nutrición — pendiente

- [ ] Token pasivo vencido, 401 antes de navegar y 401 después de adoptar la petición: sin cierre de sesión provocado por precarga; abrir/reintentar recupera por la vía interactiva y no muestra falso vacío.

- [ ] Inicio → Nutrición → ayer, dejando completar Inicio y también navegando durante la precarga: mostrar la fecha correcta sin carga innecesaria cuando existe lectura; conservar «Lectura de…» / «Actualizando…». Las lecturas de Inicio tienen prioridad y el detalle no se confunde con el resumen.
- [ ] Fechas rápidas hacia atrás/adelante: solo vecinas, sin fechas futuras ni recorrido automático del calendario. Cambiar comidas/métricas, mover o borrar una comida y reabrir un día precargado: invalidación/relectura correctas, sin modificar borrador/pendiente ni aceptar una respuesta atrasada.
- [ ] Sin red o token vencido durante precarga: Inicio sin aviso invasivo ni cierre de sesión; al abrir, lectura anterior identificada o indisponibilidad/reintento, nunca falso vacío. Cambiar cuenta/logout: sin datos anteriores. Claro/oscuro, texto grande, VoiceOver y navegación fluida. No aprobado por tests.
