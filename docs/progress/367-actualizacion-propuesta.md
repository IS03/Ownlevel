# #367 — Texto propuesto para actualizar el issue (no aplicado)

**Para Dirección.** Este archivo es una propuesta: el issue #367 y el PR #441 **no fueron modificados**. Se sugiere
reemplazar el bloque inicial «AUDITORÍA DE ESTADO — 09/11/2026» por el siguiente y dejar intacto el resto del cuerpo
(decisiones del 31/10, base auditada y antecedentes).

---

> **DECISIÓN DE DIRECCIÓN — 11/11/2026, `main 2c67a07`.** Reemplaza el bloque de estado del 09/11. Las secciones
> históricas de abajo se conservan como antecedentes y no describen autorizaciones vigentes.
>
> **Integrado y vigente (sin cambios):** comparador estricto y parcial con evidencias y razones de insuficiencia;
> sensaciones de energía y fatiga antes y después, con procedencia; contexto temporal de sesión y comidas; día completo,
> historial y resumen de tres meses; exploración de semanas y A/B; coincidencias **descriptivas** con cobertura; nutrientes
> semanales frente a entrenamiento y peso. Ver la [matriz de cobertura](https://github.com/IS03/Ownlevel/blob/main/docs/progress/367-matriz-cobertura.md).
>
> **Descartado:** la búsqueda **automática** de asociaciones como objetivo de producto, y con ella:
> - el [PR #441](https://github.com/IS03/Ownlevel/pull/441) como vía de producción. Su campaña reservada **no se
>   ejecuta**: el cálculo analítico muestra que no alcanzaría su umbral con los efectos de su propio protocolo
>   ([resultado negativo](https://github.com/IS03/Ownlevel/blob/main/docs/progress/367-441-resultado-negativo.md));
> - el objetivo «≤ 1 % de historiales con alguna falsa alerta automática en 24 meses», que ningún método evaluado
>   acreditó (#417, #419/#420, compuerta estricta del motor) y que el historial de una sola persona no permite alcanzar.
>
> **Evidencia previa que se conserva:** calibración del motor (cambios de rutina: 1,8 % en la compuerta estricta y hasta
> 23 % de «exploratorio» en nulos), campaña reservada de #420 (cuatro de nueve nulos sin acreditar), y los documentos de
> método de cada línea. «Consistente» sigue deshabilitado. «Coincidieron» sigue siendo una descripción, no un respaldo.
>
> **En exploración (sin implementar):** preguntas preregistradas por el usuario. Una pregunta activa, definida antes de
> los datos que la responden; riesgo provisional del **5 % por pregunta**, no por revisión.
> [Protocolo mínimo](https://github.com/IS03/Ownlevel/blob/main/docs/progress/367-preguntas-preregistradas-protocolo.md).
> Límite ya conocido: solo detectaría asociaciones personales fuertes y tardaría alrededor de un año por pregunta.
>
> **Siguiente gate:** decidir si se autoriza la calibración offline del protocolo (sintética, sin datos personales, tope
> de 2 horas de CPU). **No autorizado todavía:** interfaz, migraciones, campañas, lectura de datos de producción.
>
> **Cierre de este issue:** cuando la calibración acredite un diseño y se construya, o cuando Dirección decida que el
> alcance descriptivo ya entregado es el alcance final. No depende de QA física.

---

## Comentario propuesto para el PR #441 (no publicado)

> Dirección decidió el 11/11/2026 no llevar este procedimiento a producción ni ejecutar su campaña reservada. El control
> de error es correcto, pero la esperanza de la evidencia con un pronosticador oráculo queda en log E ≈ 2,0 a 36 meses
> para el escenario de ±30 pp, frente a un umbral de 5,30. Detalle y reproducción en
> `docs/progress/367-441-resultado-negativo.md`. Se conservan la rama y los aprendizajes de integridad. Se propone cerrar
> el PR sin fusionar.
