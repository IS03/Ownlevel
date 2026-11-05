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
| EXPAND de la revisión | No aplica: ningún código lo lee | | |
| ADOPT de la revisión | Sí, por contador | Contador | Detecta todo cambio confirmado en las fuentes cubiertas |

Una prueba en #386 deja escrito ese límite: si dejara de ser cierto, fallaría. En este PR, la misma prueba comprueba que el cambio se detecta y se lee de nuevo.

## La revisión transaccional

`insights_source_revisions` guarda un contador por cuenta. Un trigger diferido lo mueve en la misma transacción que los datos, al confirmar, una vez por transacción y por cuenta. Quien ve el mismo valor dos veces sabe que no confirmó ninguna transacción que tocara esas fuentes.

**Cubre:** sesiones completadas y lo que cuelga de ellas, sensaciones, definiciones y valores de métricas, comidas, y la fecha lógica del día. Una sesión en curso o descartada no lo mueve, porque Insights no la lee y un entrenamiento no debe hacer fallar las lecturas. Una fila movida entre sesiones cuenta por los dos lados: la base permite esos movimientos, también con el token de su dueño.

**Orden de los bloqueos:** cada evento toma un solo bloqueo, uno de aviso por cuenta, al confirmar, y recién entonces lee el estado de la sesión, sin bloquearla. Un commit nunca espera una sesión ni una serie. Un primer diseño revisaba la sesión con `FOR SHARE` y tenía deadlock real, reproducido con conexiones y barreras. Una sesión completada mientras otra transacción escribe bajo ella sigue contando: se prueba forzando los dos órdenes.

**Costo por lectura:**

| Pedido | Hoy (#386) | Con ADOPT |
| --- | --- | --- |
| Lectura completa | `P + 14` | `P + 2` |
| Otra vista de la misma revisión | `P + 14` | **1**, si sigue en memoria |

Además elimina la consulta de `workout_sets` con plan frágil, que tardaba 1,2 s sin estadísticas.

**Sigue sin ser una garantía de rendimiento:** la reutilización vive en la memoria del proceso. En otra instancia de Vercel se paga la lectura completa, y la tasa de aciertos real no se conoce.

## Límites de la revisión transaccional

- Serializa el commit de las escrituras de una misma cuenta, también las de una sesión en curso. Son breves, pero no se midió con carga real.
- Depende de `READ COMMITTED`, que es lo que usa el producto.
- Una transacción que escriba en dos cuentas, en orden opuesto a otra, puede tener deadlock. Ningún camino del producto lo hace, y un token no puede.
- Un constraint diferido que espere después de este bloqueo cierra un ciclo: reproducido con commits reales en vistas de progreso y orden de ejercicios de sesión, cuando dos transacciones escriben una fuente y la misma posición. Uno solo confirma y el otro recibe `40P01` en vez de `23505`, tras esperar `deadlock_timeout`. Ninguna función del producto llega ahí: las vistas no escriben fuentes y las funciones de sesión bloquean la sesión primero. El orden de rutinas no llega, porque el bloqueo por usuario lo ordena antes del commit. Falta decidir qué hacer con un `PATCH` directo con token sobre `exercise_order`, que no se probó en esa ventana.
- `TRUNCATE` y `session_replication_role = replica` no disparan triggers. Ningún camino del producto los usa.
- Cubre lo que Insights lee hoy. Una fuente nueva necesita su trigger.
