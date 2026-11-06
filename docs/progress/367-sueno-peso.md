# #367 — Sueño con noche declarada y peso corporal en Insights

## Sueño: qué noche dice la fecha

### Cómo se identifica

La métrica de sueño es la de `user_metrics.system_key = 'sleep'`. **Nunca se identifica por su nombre visible, su unidad ni una traducción.**

### Convención nueva: `sleep_night_ending_on_date/1`

**El sueño registrado en la fecha D es la noche que terminó la mañana de D.** Para entrenar el martes, «cuánto dormiste anoche» es el sueño registrado el martes.

### Cómo se explica al cargar

Mobile (hoja de métrica y editor del día) y Web (Hoy e Historial) muestran, junto al campo de sueño, `sleepNightCaption(fecha, hoy)`:

| Fecha | Texto |
| --- | --- |
| Hoy | «Cuánto dormiste anoche: la noche que terminó esta mañana.» |
| Ayer | «La noche que terminó ayer a la mañana.» |
| Otra | «La noche que terminó la mañana del miércoles 28 de octubre.» |

Nunca dice «anoche» si la fecha no es hoy.

### Dónde se guarda

Tabla `daily_metric_value_conventions`, una fila por valor. **La declaración vale solo para la versión exacta del valor que describe:** `updated_at`, valor y fecha.

| Caso | Resultado |
| --- | --- |
| Valor guardado desde la pantalla que muestra la convención | Declarado, en la misma transacción que la escritura |
| Edición posterior desde cualquier cliente, incluidos los viejos | La declaración queda desactualizada y se lee como no declarada |
| Valor borrado | La declaración se borra en cascada |
| Valor omitido de un guardado | No cambia nada |
| Cambio de fecha | El dominio no permite mover un valor (`daily_metric_identity_is_immutable`). Cambiar de fecha es borrar y crear |
| Respuesta perdida en Mobile, mismo request | Repite el recibo y no declara nada nuevo: el primer intento escribió el valor y la declaración juntos |
| Guardar el mismo valor que ya existía | No se declara: solo se declara lo que esa transacción escribió |

### Clientes antiguos e historial

- **Sin backfill.** Todo valor existente queda con convención desconocida.
- **Un cliente instalado no declara nada.** Usa los escritores v1, y cualquier edición suya invalida una declaración anterior.
- **Ningún cliente escribe la tabla directamente:** solo puede leer sus filas.
- Los envoltorios y la confirmación explícita (`declare_sleep_night_v1`, con CAS sobre `updated_at`) son la única forma de declarar.

### Qué no cambia

- **La captura sigue siendo opcional.**
- Las fechas y los valores históricos quedan como están.
- Un sueño no registrado nunca se lee como cero horas.

## Peso corporal: el valor del día

### Fuente

`day_logs.weight_kg`, **el mismo registro que usan Cuerpo, Mobile y Web.** No hay otro registro de peso.
- Es un valor por fecha lógica, así que la «resolución canónica» de varias mediciones ya es única: la del día.
- Insights lo lee embebido en la página de sesiones que ya leía.

### Exposición: peso registrado en la misma fecha lógica del entrenamiento

- **No sabemos si se midió antes o después de entrenar.** Es contexto del día (`same_day_unordered`), no un antecedente confirmado.
- **Un día con dos sesiones aporta un solo valor:** las filas son días, no sesiones ni ejercicios.
- **Sin peso registrado:** `weight_not_recorded`, y no se inventa un peso.
- **Cero o no positivo:** `weight_invalid`. Cero, ausente e inválido quedan distintos.
- **No se usa una medición futura:** solo la de la misma fecha.
- **Peso corporal y carga levantada son variables distintas:** la carga sale solo de `workout_sets`.

### Pendiente

Tendencias, ventanas y cambios porcentuales de peso quedan para otra entrega.

## Contador de fuentes (#391)

**Antes:** el contador de `day_logs` solo se movía con `log_date`. Una corrección de peso no lo movía, y una relación vieja podía quedar servida desde caché.

**Ahora, en `day_logs`, tres triggers nuevos con la misma función:**
- al insertar con peso;
- al cambiar el peso;
- al borrar con peso.

Un `day_log` sin peso y los cambios de sus totales siguen sin mover el contador. Las declaraciones de sueño mueven el contador por el camino `direct`, como un valor de métrica.

**Sin cambios:**
- las dos pasadas y el orden de bloqueos;
- la función compartida: no se tocó;
- las guardas de inventario: no hubo que cambiar ninguna.

## Método 2: familia, versión y publicación

**Es opcional:** `?method=2`, `insights-engine/2` y parcial `insights-engine-partial/2`, con su propia entrada de caché.
- Un cliente que no lo pide recibe la familia `/1` sin cambios: el contrato estricto instalado no ve familias nuevas.
- Mobile pide el método 2 en todas sus vistas.

### Candidatos nuevos (estricto y parcial)

| Candidato | Valores | Base temporal |
| --- | --- | --- |
| `sleep:<id>:night_before` | Solo valores declarados de la fecha D, con el entrenamiento de D | `declared_night_ending_on_day` |
| `sleep_undeclared:<id>:same_day` / `previous_day` | Solo valores sin declarar, en las dos ventanas viejas; un valor declarado nunca se reutiliza | `undeclared_sleep_date` |
| `body:weight_kg:same_day` | Peso del día del entrenamiento | `same_day_unordered` |

**Lo que no se cuenta dos veces:** para el sueño declarado no se prueba otra fecha como observación independiente de la misma noche. Los valores sin declarar van aparte y con su límite visible.

### Tamaño de la familia

Por cuenta con sueño, son **2 candidatos más que en `/1`**:
- 3 de sueño en lugar de 2;
- 1 de peso.

`candidatesEvaluated` los cuenta todos, y la corrección por familia (máximo por permutación) incluye a todos.

### Simulación dirigida

Archivo: `family-size.campaign.test.ts`, con 400 historias por caso y 199 permutaciones. Es la misma política, con 12 y 14 candidatos. **No reutiliza la calibración anterior como prueba.**

| Escenario | Exploratorio en la historia (12 → 14) | Portón estricto (12 → 14) | Límite superior Wilson 95 % con 14 |
| --- | --- | --- | --- |
| Independiente | 1,3 % → 0,3 % | 0,25 % → 0 % | 0,95 % |
| Autocorrelado | 3,3 % → 5,8 % | 0,5 % → 0 % | 0,95 % |
| Tendencia compartida (peso que baja con los meses) | 19 % → 25 % | 0,75 % → 1,0 % | 2,5 % |
| Ausencia selectiva | 0 % → 0 % | 0 % → 0 % | 0,95 % |
| Empates ordinales | 1,5 % → 1,5 % | 0 % → 0 % | 0,95 % |

**Lectura:**
- **Con tendencia compartida, el portón estricto no cumple el 1 %, ni antes ni después.** Por eso «consistente» sigue deshabilitado y el 1 % sigue sin aprobar.
- Lo exploratorio sube con la familia más grande, así que se publica solo con su texto de límite.

### Qué se publica

- **Estados:** solo «sin datos», «sin señal» o «exploratorio», como hasta ahora.
- **Texto de cada relación nueva:**
  - qué noche o qué peso se usó;
  - que el peso es contexto del día;
  - que puede coincidir con el tiempo sin tener que ver.
- **Nunca** causas ni recomendaciones.

### Fixtures dirigidos

`sleep-weight.test.ts`:
- sueño histórico ambiguo;
- valores con convención;
- declaración desactualizada;
- peso constante, que no se publica;
- tendencia temporal, que no pasa;
- ausencia;
- varias sesiones en un día.

## Costo

**Las lecturas no aumentan:** siguen siendo 7 lecturas agrupadas más 2 del contador, ahora con dos embebidos.

Medido en la pila local (17.6, PostgREST), un año de datos, mediana de 10 rondas por lectura:

| Lectura | Antes | Ahora |
| --- | --- | --- |
| Sesiones, una página | 4,3 ms, 56 KB | 4,5 ms, 59 KB |
| Valores de métricas, una página | 3,6 ms, 50 KB | 5,3 ms, 99 KB |

Es una pila sin carga: no predice producción.
