# Insights #367 — Revisión de las fuentes

Qué garantiza hoy el control de cambios de una lectura de Insights, y qué lo reemplaza.

## El problema

La revisión de PR 4 es cantidad de filas y máximo de `updated_at` por fuente. **No identifica todos los cambios.** `updated_at` es la hora en que empezó la transacción, así que:

| Paso | Fila A | Fila B | Cantidad y máximo |
| --- | --- | --- | --- |
| T1 empieza y cambia B, sin confirmar | 12:00 | 12:01 (no visible), valor 10 | Visible: 2, 12:00 |
| T2 cambia A y confirma | 12:02 | 12:00, valor 10 | **2, 12:02** |
| Una lectura guarda su resultado | | | **2, 12:02** |
| T1 confirma | 12:02 | **12:01, valor 11** | **2, 12:02** |

La fila B cambió y la revisión es idéntica.

**Reproducido** con dos transacciones reales contra PostgREST local:
- **Con caché caliente** (el primer diseño de #386): la pantalla mostraba 10 con la base en 11, bajo la misma revisión.
- **Alrededor de una lectura:** si esa transacción confirma mientras se leen los flujos, el control de antes y después no la ve y publica la lectura sin reintentar.

**Lo que no lo arregla:**
- Agrupar las mismas consultas en una RPC.
- Un TTL más corto: acorta la ventana, no la cierra.
- Una secuencia por fila: sus valores se entregan antes de confirmar, y tienen el mismo hueco.

## Estado por PR

| PR | Reutiliza resultados | Identidad de una lectura | Control durante la lectura |
| --- | --- | --- | --- |
| #385, #386 | **No.** Cada vista es una lectura completa | Hash de las filas leídas | **De mejor esfuerzo.** No garantiza detectar el cambio de arriba |
| EXPAND de la revisión ([#391](https://github.com/IS03/Ownlevel/pull/391), en `d20ff78`) | No aplica: ningún código lo lee | | |
| ADOPT de la revisión (#392) | Sí, por contador | Contador | Detecta todo cambio confirmado en las fuentes cubiertas |

Una prueba en #386 deja escrito ese límite: si dejara de ser cierto, fallaría. En este PR, la misma prueba comprueba que el cambio se detecta y se lee de nuevo.

## La revisión transaccional

`insights_source_revisions` guarda un contador por cuenta. Un trigger diferido lo mueve en la misma transacción que los datos, al confirmar, una vez por transacción y por cuenta. Quien ve el mismo valor dos veces sabe que no confirmó ninguna transacción que tocara esas fuentes.

**Cubre:** sesiones completadas y lo que cuelga de ellas, sensaciones, definiciones y valores de métricas, comidas, y la fecha lógica del día. Una sesión en curso o descartada no lo mueve, porque Insights no la lee y un entrenamiento no debe hacer fallar las lecturas. Una fila movida entre sesiones cuenta por los dos lados: la base permite esos movimientos, también con el token de su dueño.

**Orden de los bloqueos:** cada evento toma un solo bloqueo, uno de aviso por cuenta, al confirmar, y recién entonces lee el estado de la sesión, sin bloquearla. Con el bloqueo tomado, un commit no espera una sesión ni una serie. Un primer diseño revisaba la sesión con `FOR SHARE` y tenía deadlock real, reproducido con conexiones y barreras. Una sesión completada mientras otra transacción escribe bajo ella sigue contando: se prueba forzando los dos órdenes.

**Costo por lectura:**

| Pedido | Hoy (#386) | Con ADOPT |
| --- | --- | --- |
| Lectura completa | `P + 14` | `P + 2` |
| Otra vista de la misma revisión | `P + 14` | **1**, si sigue en memoria |

Además elimina la consulta de `workout_sets` con plan frágil, que tardaba 1,2 s sin estadísticas.

**Sigue sin ser una garantía de rendimiento:** la reutilización vive en la memoria del proceso. En otra instancia de Vercel se paga la lectura completa, y la tasa de aciertos real no se conoce.

## Dos pasadas

La migración vive solo en #391: este PR no la copia ni la modifica. La referencia es [`d20ff78`](https://github.com/IS03/Ownlevel/blob/d20ff7885ed43237492baa76861b7f30720d3ba5/supabase/migrations/20261104190000_insights_source_revision_expand.sql), con el detalle en [su descripción](https://github.com/IS03/Ownlevel/blob/d20ff7885ed43237492baa76861b7f30720d3ba5/docs/progress/367-insights-source-revision-expand-pr-description.md).

**Qué cambió:** el trigger de cada fuente ya no toma el bloqueo. Anota el cambio en `insights_source_pending`, una tabla sin WAL y cerrada a `anon`, `authenticated` y `service_role`. Anotar encola un segundo trigger diferido, que toma el bloqueo, lee el estado de la sesión, mueve el contador y borra su nota.

**Por qué corrige el fallo:** al confirmar, Postgres dispara los eventos pendientes y deja para una vuelta siguiente lo que ellos encolan. Los rechecks de unicidad corren en la primera vuelta, cuando esta transacción todavía no tiene el bloqueo. Si un recheck espera a otra transacción, no cierra un ciclo con ella.

**Para ADOPT no cambia el contrato:** el contador se sigue moviendo en la misma transacción que los datos, y no se mueve antes del commit ni en un rollback.

**Fallos reproducidos con la versión anterior (`5672002`):**

| Cruce | Con `5672002` | Con dos pasadas |
| --- | --- | --- |
| `PATCH` de dos filas de sesiones distintas contra otro a la misma posición, con gancho, solo con el token | `40P01`, status 500 | T1 confirma, T2 recibe 409 `23505` sin aplicar nada, contador +1 |
| `PATCH` de 4001 filas y otro de 2 filas, 100 ms después, sin gancho | 9 `40P01` en 15 rondas | 0 en 75 rondas |
| Fuente y misma posición, en vistas y en orden de sesión, con dos conexiones | `40P01` | `23505` |

El gancho solo existe en la base descartable: frena una request después de escribir y antes de confirmar. El `PATCH` directo no es un camino de los clientes, pero el permiso existe, y quien lo use se afecta solo a sí mismo.

## Evidencia

**Sobre la versión final, `d20ff78`, con el esquema de #391 y sin el código de este PR:**
- Las pruebas de cruce detectan el fallo: con la migración de `5672002`, las dos pruebas con gancho de varias filas terminan en `40P01`. Con la final pasan.
- Suite de revisión, 42 pruebas. Suite de cruce, 29 pruebas, con 3 rondas en las que no usan gancho. Finish con recibo, 35 comprobaciones.
- Limpieza en commit, rollback, savepoint y desconexión. Parada limpia y caída, a mano.

**Sobre la integración local, con dos pasadas pero sin las revocaciones de `d20ff78`:**
- Las 75 rondas de arriba, y 0 en 15 a 30 ms y a 200 ms. Esos dos retardos tampoco fallaban antes, así que no prueban nada por sí solos. La campaña no se repitió sobre `d20ff78`.
- Lectura de ADOPT, 6 pruebas y 1 omitida, e integración, 10 pruebas. Ahí el archivo de lectura incluye cambios de otros PR, así que no es el de esta rama.

**Evidencia anterior, con `5672002` y este PR:**
- La validación de la [descripción de ADOPT](367-insights-source-revision-adopt-pr-description.md) y el costo de lectura.

**Sin correr:** la suite de esta rama contra `d20ff78`. Frente a `5672002`, `d20ff78` solo cambia en la base la segunda pasada y sus revocaciones, y este PR no lee la tabla auxiliar. Espero el mismo resultado, pero es una expectativa, no una medición.

## Límites de la revisión transaccional

**Esto no es una garantía general de ausencia de deadlocks.** Las dos pasadas cierran los cruces de arriba. Un cliente todavía puede recibir `40P01`, por ejemplo entre escrituras que bloquean filas en orden opuesto, algo que no depende del contador y que no se probó aquí.


- Serializa el commit de las escrituras de una misma cuenta, también las de una sesión en curso. Son breves, pero no se midió con carga real.
- Agrega un insert y un delete por cambio distinto. En una pila local sin carga, el peor caso medido (4000 notas en una escritura) sumó unos 60 ms, un 30 %. No predice producción: falta OBSERVE.
- Depende de `READ COMMITTED`, que es lo que usa el producto. Una transacción `REPEATABLE READ` leería un estado viejo de la sesión.
- El orden entre vueltas es lo observado en PostgreSQL 17.11, no una garantía que haya confirmado en el manual. No comparé la versión menor de producción, y una actualización mayor debería repetir las pruebas de cruce.
- Una transacción que escriba en dos cuentas, en orden opuesto a otra, puede tener deadlock. Ningún camino del producto lo hace, y un token no puede.
- Hoy lo único diferido son los rechecks de orden de rutinas, vistas de progreso y ejercicios de sesión, y estos dos triggers. Un trigger diferido futuro que escriba en estas tablas podría encolar un recheck después del contador; una prueba de #391 falla si aparece.
- `SET CONSTRAINTS ALL IMMEDIATE` adelanta las dos pasadas y toma el bloqueo antes del commit. Ningún camino del producto lo hace, y un token no puede.
- Las rondas sin gancho dependen del momento. El cierre se apoya en el orden de la cola y en las pruebas con gancho, que fuerzan el cruce en cada corrida.
- Sin probar: carga real, escritores concurrentes a escala, réplicas de lectura y restauración a un punto en el tiempo.
- `TRUNCATE` y `session_replication_role = replica` no disparan triggers. Ningún camino del producto los usa.
- Cubre lo que Insights lee hoy. Una fuente nueva necesita su trigger.
