# #367 — Checklist única de QA física

Una sola lista para todo lo que sale de los PR de #367 y de #380. No se duplica por PR: cada descripción enlaza acá. **Nada de esto está aprobado.** Se hace en Diario, cuando se indique, y sin datos de prueba en la cuenta real salvo lo que el flujo normal escriba.

Lo marcado con *requiere migración* solo se puede revisar después de aplicar las migraciones de #387 y #391 y publicar sus PR.

## Común a todas las pantallas
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
Requiere una build de Mobile con `codex/367-period-summary` y la API de esa rama. Sin migración.
- [ ] **Abrir:** en Insights, «Últimos 3 meses» abre el resumen y lee una sola vez. Terminar un entrenamiento o cambiar de pestaña no lo lee.
- [ ] **Fechas:** dice el rango exacto («1 ago – 31 oct») y los tres meses. El mes en curso no entra, tampoco el día 1 de un mes.
- [ ] **Resumen escrito:** frases cortas con cifras. Ninguna dice que una cosa explica otra, ni da causas, rangos óptimos o recomendaciones.
- [ ] **Entrenamiento:** «Comparación completa» y «Con contexto parcial» en filas separadas. Las rutinas en orden solo si una terminó antes de la otra; si se alternaron, lo dice.
- [ ] **Sensaciones:** energía y fatiga al terminar en palabras de la escala, cada una con su propia cobertura («respondida en 2 de 3 sesiones; 1 más tarde y 1 sin respuesta»). Una respuesta tardía no aparece como «sin respuesta». Sin promedios ni puntajes.
- [ ] **Comidas:** «Comidas registradas · N de 92 días». Aclara que un día sin comidas no es cero y que es lo registrado.
- [ ] **Peso:** semanas enteras con mediana y cambio, incluidos los pesajes de días sin entrenar. Sin semanas con 3 pesajes, lo dice.
- [ ] **Detalles y vuelta:** «Ver tu peso en Cuerpo» abre los mismos tres meses y «Volver a Insights» vuelve al resumen. «Ver los días en Insights» y «Ver Cómo terminaste» vuelven con atrás.
- [ ] **Estados:** un período sin registros dice «Sin registros en estos tres meses». Sin red: «Uy, no pudimos leer tus datos», nunca vacío.
- [ ] **Texto grande y VoiceOver:** las filas se apilan sin cortar números y se leen completas.
