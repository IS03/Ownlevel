# M9.3 · Editor de rutina — QA físico

Pasada Mobile fuera de la sesión activa. Referencias: `bocetos/rutina-editor/01` a `10` (opción 1 de la 10, más el flotante de la 02), [marca](../brand/ownlevel-marca/IDENTIDAD.md) y [plan M9](m9-brand-polish-plan.md). No hay cambios de API, migraciones ni dependencias nativas nuevas.

Usar una copia de una rutina para poder cambiar sus objetivos y quitar ejercicios durante el QA. Repetir la parte visual en claro y oscuro, con Reducir movimiento activado y desactivado. La validación automatizada no reemplaza estas comprobaciones en Simulator/iPhone.

## Pantalla y navegación

- [ ] El nombre aparece como Large Title nativo. Al scrollear pasa a la barra de vidrio y al volver arriba se expande. Se omite la tira del título para conservar este comportamiento nativo; tampoco hay punto en el título chico.
- [ ] Volver lleva a Rutinas, también si se abrió una rutina archivada. Metadatos, nombres largos y cifras se leen sin solaparse; las filas no tienen círculos, colores ni menús propios.
- [ ] “+ Agregar” aparece en el encabezado. Cuando queda completamente fuera de pantalla aparece el + pequeño sobre la barra de pestañas. No quedan dos controles visibles; al regresar se retira el flotante. Se oculta con una hoja, teclado o arrastre abiertos.
- [ ] El menú superior tiene Cambiar nombre y color, Duplicar rutina y Archivar/Restaurar. Archivar no es rojo ni pide confirmación; cambia la pantalla a archivada, oculta Iniciar y permite Deshacer durante cuatro segundos.

## Hoja del ejercicio

- [ ] Tocar abre la hoja grande. X, Historial y ✓ tienen zonas táctiles cómodas. ✓ está deshabilitado sin cambios, y mientras guarda no permite cerrar ni enviar otra escritura.
- [ ] Peso vacío muestra “—”; cero explícito muestra 0. Cambiar peso/reps/RIR y guardar actualiza el ejercicio; reabrir conserva esos valores. Probar coma decimal, un valor inválido y notas de más de 1000 caracteres: el error aparece junto al campo.
- [ ] Agregar serie copia los valores de la última. Swipe rojo quita una serie y renumera; la última queda protegida. Con 50 series, Agregar queda deshabilitado.
- [ ] Más peso y Más reps son opciones excluyentes que se pueden desmarcar. El texto anuncia el recordatorio correspondiente, sin cambiar los objetivos automáticamente. Un ajuste personalizado sigue visible hasta elegir otra opción.
- [ ] X con cambios ofrece Seguir editando/Salir sin guardar. Historial pide la misma decisión y navega después de terminar el cierre nativo de la hoja. Sin cambios, ambas acciones funcionan directamente.
- [ ] El gesto de cerrar la hoja se bloquea mientras hay cambios o una escritura pendiente; para descartar se usa X. El SDK no expone el intento de cierre interactivo para mostrar la confirmación desde ese gesto.

## Descanso

- [ ] Abrir las ruedas no cambia el valor ni habilita ✓ por sí solo. “Sin descanso” y 0:00 son opciones distintas.
- [ ] Si ya hay un valor como 2:20, aparece exactamente y se conserva al guardar otros campos. Las opciones normales avanzan de 15 s en 15 s, hasta 60:00.
- [ ] Las ruedas no permiten invertir el rango. Cambiar una rueda conserva la otra; elegir Sin descanso no convierte el valor vacío en cero.

## Agregar y ordenar

- [ ] Buscar y filtrar muestra una lista agrupada. Los existentes aparecen apagados con “En la rutina”; los archivados del catálogo no se ofrecen para agregar.
- [ ] Elegir varios, cambiar de filtro y volver conserva la selección. Agregar incorpora todos en el orden elegido, en una sola operación. Un catálogo fallido muestra error, nunca “sin resultados” ni Crear.
- [ ] Buscar un nombre sin resultados, usar Crear y confirmar el alta: queda marcado en el selector. Se incorpora a la rutina recién al pulsar Agregar.
- [ ] Mantener y arrastrar levanta la fila, desplaza las otras y permite seguir hacia los bordes. Soltar guarda una vez. Cancelar no guarda; soltar sin mover tampoco abre el editor. No se agrega vibración de la app al arrastre.
- [ ] Swipe izquierdo muestra Quitar rojo. Cancelar la confirmación conserva todo; confirmar quita solo la relación con esta rutina. El ejercicio y las sesiones anteriores siguen disponibles.
- [ ] VoiceOver ofrece Mover arriba/Mover abajo y Quitar; el orden por estas acciones se guarda igual que al arrastrar.

## Identidad, copia y confiabilidad

- [ ] La hoja compartida muestra vista previa, 12 colores y Sin color. Cambiar nombre/color mantiene el mismo ejercicio y sus objetivos. Volver a la biblioteca muestra la actualización.
- [ ] Duplicar propone “nombre copia”, permite editarlo y muestra el conteo real. La copia queda activa debajo de la original en la biblioteca; la original conserva sus objetivos.
- [ ] Iniciar pide confirmación, respeta una sesión ya en curso y usa el flujo existente de reintento.
- [ ] Sin conexión: se conservan los datos confirmados y se informa lectura vieja. Un guardado que no se puede confirmar deja el borrador abierto; no muestra éxito ni reintenta solo.
- [ ] Conflicto entre dispositivos: abrir una hoja en el iPhone, cambiar la misma plantilla desde Web/otro dispositivo y guardar en el iPhone. Debe cerrar el borrador, avisar que no se guardó y recuperar la versión del servidor. Repetir con el orden. No debe mezclar ni sobrescribir versiones.
- [ ] Regresión de biblioteca: mantener una rutina y soltar después del haptic abre el menú sin navegar al editor; empezar un swipe derecho no muestra la acción por debajo de una fila transparente.
