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

## Después de las migraciones
- [ ] *Requiere migración.* **Hora de comida (#388):** elegir la hora la declara, incluso con el mismo valor. Abrir una edición, mover de día o repetir una comida no declara nada.
- [ ] *Requiere migración.* **Ventana previa (#389):** una comida con hora declarada cuenta; una con reloj automático no.
- [ ] *Requiere migración.* **Reutilización (#392):** volver a una vista sin cambios es inmediato; registrar una comida la actualiza.
- [ ] **ChatGPT:** las migraciones ya están aplicadas. Falta el paso manual de quien administra cada conexión (GPT con Action y conector MCP), con su comprobación: [paso manual](../integrations/chatgpt-nutrition.md#paso-manual-actualizar-las-conexiones-de-chatgpt-367).
