# Cuerpo: cambios y contexto en el tiempo

Fecha: 19/11/2026. Estado: implementación autorizada el 19/11/2026. Ver [entrega y verificación](cuerpo-contexto-y-relaciones-entrega.md).

## Objetivo y decisiones

Entender qué cambió en el peso y las medidas corporales, qué se registró durante ese intervalo y cómo explorar cada medida. Comparar observaciones no demuestra qué produjo el cambio ni permite distinguir músculo, grasa o agua.

Primera versión con tres secciones:

1. **Qué cambió en tu cuerpo:** peso y medidas entre dos fechas, diferencias en kg y cm por separado.
2. **Qué registraste entre esas fechas:** alimentación, etapas, entrenamiento y métricas personales.
3. **Mirar una medida en detalle:** evolución, registros originales y contexto seleccionado.

Se acepta para esta versión el catálogo actual: cintura, abdomen, pecho, cadera, brazos, muslos y pantorrillas; lados separados donde existen. No hay medida específica de espalda ni de hombros. El contorno de pecho no aísla la espalda: explicarlo junto a esa medida cuando se consulte su relación con entrenamiento. Agregar contorno de hombros queda fuera y requerirá una iniciativa explícita de esquema, API, carga y compatibilidad.

No se implementarán cm/kg, reparto de kilos entre zonas, estimación de composición corporal, recomendaciones causales, correlaciones automáticas, desfases configurables ni mediciones repetidas del mismo día. Estas últimas podrían servir para estudiar la repetibilidad personal en otra iniciativa; dos repeticiones aisladas no bastan para prometer un error individual validado.

## 1. Qué cambió en tu cuerpo

Ampliar el comparador existente, sin crear un cuarto recorrido independiente.

- Usar el período compartido de Progreso; entrada inicial de 30 días.
- Elegir dos fechas reales de registro corporal. Por defecto, las dos últimas fechas de medidas con al menos un mismo campo válido comparable; si no existen, usar las dos últimas fechas de pesaje válido. Si tampoco existen, mostrar qué falta y permitir consultar registros.
- Cada fila compara exclusivamente el mismo campo en ambas fechas. No completar una fecha con un valor anterior ni con el más cercano. Las zonas sin ambos valores siguen visibles como no comparables.
- Mostrar valores inicial/final, sus fechas, diferencia y duración. Derecha e izquierda van juntas visualmente, conservando sus cálculos separados. No mezclar brazo/muslo antiguos sin lado con campos laterales.
- La diferencia se denomina cambio observado, no crecimiento confirmado. Junto a los números de perímetros: «La diferencia puede incluir variación al medirte; no confirma un cambio de músculo o grasa». Sin margen fijo ni etiqueta «dentro del margen».
- Permitir intervalos cortos. Por debajo de 21 días, mostrar «Intervalo corto · diferencia entre registros, no una tendencia». Los 21 días son una regla de presentación de producto, no un umbral científico ni garantía para intervalos mayores.
- El detalle puede mostrar cambio observado dividido por días transcurridos y multiplicado por siete, etiquetado «Equivalente por semana entre estos registros». No usarlo para extrapolar ni para clasificar progreso. No mostrarlo en intervalos menores de 21 días.

### Peso y fechas distintas

El peso directo solo se compara cuando hay pesajes válidos en ambas fechas elegidas. Nunca usar el peso del perfil ni sustituir fechas silenciosamente.

Ofrecer un modo explícito «Peso semanal de referencia»: mediana de las semanas calendario que contienen las mediciones, con fechas de cada semana y cantidad de pesajes. Reutilizar el criterio existente de semana completa y cerrada con al menos tres pesajes válidos. Leer esas semanas completas aunque excedan el intervalo elegido, identificándolas como referencia; no mezclar este dato con el contexto del intervalo. Si falta cobertura o las dos fechas caen en la misma semana, no calcular un cambio semanal de referencia. La mediana no representa el peso exacto del día de la medición.

## 2. Qué registraste entre esas fechas

El contexto abarca desde el día posterior al primer registro hasta el día anterior al segundo. Se excluyen ambos extremos porque los contratos no incluyen la hora de las mediciones. Mostrar el intervalo efectivo; con fechas consecutivas, conservar la comparación corporal y explicar que no hay días intermedios.

- **Alimentación:** calorías y macros registrados, con promedio por días con dato y cobertura propia de cada nutriente. Días con comidas no equivale a ingesta completa; día cerrado no equivale a registro completo. Objetivos y etapas deben ser históricos, sin aplicar retroactivamente el objetivo actual.
- **Etapas:** mostrar todas las etapas que intersectan el intervalo, con sus fechas efectivas; no atribuir una sola etapa a un intervalo mixto. Sin datos históricos disponibles, indicar su ausencia.
- **Entrenamiento:** sesiones, series y duración registradas; distribución por grupo muscular disponible en la fuente canónica. La duración incluye descansos y no mide intensidad.
- **Métricas:** selector de una métrica numérica o de duración disponible; resumen y cobertura según su agregación canónica. Cero registrado sigue siendo cero; ausencia no es cero.

Reglas obligatorias del contexto muscular:

1. No asociar automáticamente cintura o abdomen con ejercicios abdominales ni sugerir reducción localizada de grasa.
2. Cada ejercicio computa para un único grupo según la clasificación actual. Indicarlo cerca del desglose; no inventar series indirectas ni sumar un ejercicio a varios grupos.
3. Presentar el desglose del entrenamiento del intervalo, sin convertir relaciones anatómicas en explicaciones del cambio de contorno. Pecho no separa pectoral y espalda; piernas no distingue por sí sola estímulo de muslo y pantorrilla. Mantener visibles los grupos no asignados cuando la fuente los identifique.

## 3. Mirar una medida en detalle

- Reutilizar selector corporal, gráficos y navegación al original.
- Peso: observaciones por fecha y opción de medianas semanales existente. Perímetros: registros reales, aunque sean pocos.
- Contexto opcional, calorías por defecto: gráfico debajo del corporal con el mismo eje temporal, unidades y escala propias. Una variable de contexto por vez; no superponer ejes diferentes.
- Selección sincronizada por fecha sin inventar un dato corporal para días sin medición. Si falta un dato, decirlo. Sin interpolar huecos ni trasladar registros entre fechas.
- Abrir originales y volver conservando período, medida, contexto y selección que siga siendo válida.

## Arquitectura, contratos y compatibilidad

Base de inspección: main `965d699e2332f7a10b7b81fa1b1449c0596f3885`; revalidar al iniciar porque Claude sigue trabajando. Esta planificación no inspeccionó datos privados actuales ni demuestra relaciones personales.

Reutilizar BodyRecordComparison, selector corporal, fuentes de Cuerpo/Explorar/Nutrición/Métricas, período compartido, gráficos y navegación existentes. Mobile siempre accede mediante Mobile API v1 con identidad del token, nunca a tablas de producto.

**La respuesta actual de Cuerpo permanece intacta.** Sus parsers exigen claves exactas: no agregar campos, aunque parezcan aditivos. Combinar las lecturas existentes en un modelo de presentación local cuando alcancen. Si falta información indispensable, crear una lectura separada, con contrato y parser propios: primero PR de servidor EXPAND compatible y desplegado; después PR de Mobile ADOPT. No se necesita un endpoint nuevo si los contratos actuales resuelven la capacidad. Sin migración en esta versión.

El modelo de presentación reúne comparación exacta, referencias semanales identificadas, intervalo de contexto, resúmenes, cobertura y disponibilidad por fuente. Ningún cálculo nuevo modifica datos históricos, escrituras, RLS, CAS o idempotencia.

Evitar consultas por punto. Cargar comparaciones/contextos del intervalo y únicamente la serie de contexto seleccionada; reutilizar caché existente por cuenta, rango y variable. Descartar respuestas de selecciones antiguas y limpiar estado al cambiar de cuenta. Ante error, conservar el estado de indisponibilidad de la fuente, sin fingir ausencia de registros. Revalidar al corregir un original.

Unificar palabras y accesos con «Qué influye» y «Lo que se movió junto», preservando sus preguntas y cálculos actuales. No retirarlos ni redirigirlos automáticamente hasta acordar una migración específica.

## Evidencia y límites

- [Bhutani: composición del cambio de peso a dos semanas](https://pmc.ncbi.nlm.nih.gov/articles/PMC5506524/): variaciones cortas no identifican cambios de grasa o músculo individuales.
- [Hall: modelo dinámico de balance energético](https://pmc.ncbi.nlm.nih.gov/articles/PMC3880593/): evitar conversiones fijas de calorías a kilos y estimaciones personales infundadas.
- [Daza: análisis causal de series personales](https://pmc.ncbi.nlm.nih.gov/articles/PMC6087468/): autocorrelación, tendencias y factores de confusión impiden interpretar coincidencias como causas.
- [Verweij: error de medición de cintura](https://pmc.ncbi.nlm.nih.gov/articles/PMC10271771/) y [Barrios: automedición de cintura, cadera y cuello](https://link.springer.com/article/10.1186/s12874-016-0150-2): justificar advertencias y protocolos consistentes; no trasladar un margen universal a otras zonas o personas.

No activar `insights-body-weekly/1`. Su validación negativa está documentada en [367-evolucion-corporal-metodo.md](367-evolucion-corporal-metodo.md). #441 corresponde a otra investigación y no es la referencia de ese resultado.

## Diseño y accesibilidad

Aplicar la [identidad canónica](../brand/ownlevel-marca/IDENTIDAD.md) y tokens mediante el sistema de diseño. Champagne, claro/oscuro, números tabulares, superficies sobrias sin tarjetas blancas añadidas por defecto. Glass solo en controles.

Usar controles, sheets, animaciones y haptics existentes. Respetar Reduce Motion y preferencias de haptics; sin animación decorativa. VoiceOver debe poder consultar fechas, cifras, cobertura y ausencias sin depender del gráfico. Dynamic Type apila pares y controles; objetivos táctiles nativos mínimos.

## Ejecución cuando el usuario indique comenzar

1. Verificar main, cambios locales y propiedad del trabajo con Claude; checkout aislado sin stash, reset ni modificaciones de su trabajo. Leer instrucciones y fuentes relevantes actualizadas.
2. Implementar modelo descriptivo y pruebas de fechas, diferencias, cobertura y referencias semanales. Confirmar suficiencia de contratos antes de UI; si falta capacidad, ejecutar EXPAND separado antes de ADOPT.
3. Implementar las tres secciones y sus accesos con componentes existentes. Preservar el formulario de peso y las escrituras de medidas.
4. Revisar errores, carga, actualizaciones, navegación y accesibilidad. Realizar revisión visual enfocada cuando el entorno esté disponible y registrar sus límites sin suponer QA física.
5. Ejecutar pruebas enfocadas y `npm run validate` en Mobile; validación backend proporcional si cambia. Revisar diff, preparar PR y completar merge según autorización vigente. Informar cambios y comprobaciones.

Ejecutar las etapas de corrido tras la autorización de inicio, sin pedir «seguí» entre pasos. Consultar solo por conflicto real de propiedad, bloqueo o cambio material de alcance. Ahora solo se guarda el plan: sin implementación, commit, push, PR ni cambios de Notion.

## Aceptación y pruebas

- Comparación exacta: cero/un registro, dos fechas, valores iguales, intervalos cortos, fechas consecutivas, año bisiesto y cambio de año.
- Faltantes: campos presentes en una sola fecha, medición sospechosa, datos fuera del rango, cero real en métricas y ausencia de contexto.
- Peso: días distintos a las medidas; semana cerrada/completa frente a parcial/en curso; menos de tres pesajes; ambas fechas en la misma semana; referencia fuera del intervalo claramente identificada.
- Zonas: lados juntos sin mezclarlos; campos heredados sin lado; ninguna medida específica de espalda/hombros; ningún emparejamiento cintura-abdominales; grupo muscular ausente o sin asignar.
- Nutrición: cobertura distinta por nutriente, ingesta parcialmente registrada, hoy en curso, objetivos históricos y varias etapas dentro del intervalo.
- Estado: error de una fuente, respuestas fuera de orden, cambio de cuenta, regreso desde original y corrección con revalidación.
- UI: claro/oscuro, texto grande, VoiceOver, Reduce Motion y ausencia de etiquetas moralizantes.

Terminado: las tres secciones responden con datos trazables; fechas y coberturas son visibles; no hay ausencia convertida en cero, asociaciones causales ni ruptura del contrato actual; las escrituras conservan su comportamiento.
