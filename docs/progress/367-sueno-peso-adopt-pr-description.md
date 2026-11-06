# #367 ADOPT — Noche del sueño y peso corporal en captura e Insights

**Base: `main`. Contiene los commits del EXPAND** (`codex/367-sleep-weight-expand`), así que su diff los muestra hasta que ese PR se mergee. **No mergear antes de aplicar la migración:** el loader embebe la tabla nueva y los guardados de sueño llaman a los envoltorios.

- Semántica y método: [367-sueno-peso.md](367-sueno-peso.md).
- Rollout: [367-sueno-peso-rollout.md](367-sueno-peso-rollout.md).
- Matriz: [367-matriz-cobertura.md](367-matriz-cobertura.md).

## Qué cambia

### Captura
- **Web:** Hoy e Historial muestran, junto al campo de sueño, qué noche es. «Anoche» aparece solo para hoy. El guardado declara la noche con `save_daily_metric_values_v2`.
- **Mobile:** la hoja de métrica y el editor del día muestran el mismo texto. Cada cambio de sueño con valor lleva `sleepNight`, y el servidor lo quita antes del escritor v1 (no entra al hash de idempotencia) y llama a `mobile_mutate_nutrition_day_v2`.
- **Cliente viejo o borrado:** sigue por el camino v1 y no declara nada.

### Motor (método 2, opcional)
- Disponible con `?method=2`: versión `insights-engine/2`, parcial `/2` y entrada de caché propia. Sin pedirlo, la respuesta `/1` no cambia.
- **Sueño:** `sleep:<id>:night_before` para valores declarados, más `sleep_undeclared:<id>:same_day|previous_day` para los sin declarar.
- **Peso:** `body:weight_kg:same_day`.
- **Contexto del día:** `bodyWeight` (valor y estado) y `sleepNight` en el valor de sueño.
- **Límites:** `sleepNights` y `bodyWeightTrainingDays`.

### Mobile Insights
- Pide el método 2.
- **Cada relación nueva dice:**
  - qué noche o qué peso usa, y de qué fecha;
  - que el peso es contexto del día y que puede coincidir con el tiempo;
  - qué quedó fuera y por qué.
- El peso abre Cuerpo y el sueño abre las tendencias de su métrica.

## Validación

### PostgreSQL 17.6.1.105, PostgREST y Auth

`sleep-weight.local.test.ts`, 4 pruebas, todas pasan.

**Web:**
- v2 declara con la escritura;
- la v1 y un upsert directo, como clientes viejos, dejan la declaración desactualizada;
- no se puede declarar una métrica que no sea sueño, ni una que la llamada no escribió.

**Confirmación explícita:**
- exige la versión exacta;
- nadie escribe la tabla directo (`42501`);
- otra cuenta no ve nada;
- la fecha de un valor es inmutable;
- el borrado se lleva la declaración.

**Mobile:**
- v2 declara;
- un replay no declara nada nuevo;
- la v1 deja la declaración desactualizada;
- borrar no deja nada declarado.

**Peso:**
- embebido en la misma página de sesiones;
- siguen siendo 7 lecturas;
- corregirlo mueve el contador y la lectura siguiente cambia;
- el método 1 tiene su propia entrada.

**Embebidos reales de PostgREST:** objetos.

**Costo del loader**, medido aparte en la misma pila con un año de datos: lo detalla [367-sueno-peso.md](367-sueno-peso.md#costo).

### Raíz
- `tsc` limpio y ESLint de lo tocado.
- **Motor (8 pruebas):**
  - el método 1 no cambia;
  - noche declarada, con un solo día;
  - historial ambiguo y declaración desactualizada;
  - peso con un valor por día y cero, ausente e inválido distintos;
  - peso constante, que no se publica;
  - tendencia;
  - publicación del método 2 contra el contrato.
- **Escritura:** contrato Mobile, envoltorio elegido por la ruta, guardado Web y texto de la convención.
- **Suites afectadas:**
  - `src/lib`, `src/components` y `src/app/(app)`;
  - fallan 6 pruebas, las mismas que en `main` sin estos cambios (comprobado en un worktree temporal): textos con CRLF, rutas de Windows y una migración que ya no existe con ese nombre.

### Mobile
- `typecheck` y `lint` limpios.
- 1618 pruebas pasan, 5 fallan:
  - 4 en `active-session-bridge-screen`, como en `main`;
  - 1 en `session-return-dock`, que pasa sola (12/12) y falló mientras corría en paralelo la campaña.

### Simulación dirigida
`family-size.campaign.test.ts`: los resultados están en [367-sueno-peso.md](367-sueno-peso.md#simulación-dirigida).

## Límites
- **Sin build ni QA física.**
- **El editor Web sigue con sus controles actuales.**
- **El peso es de la fecha, no del momento.** Las tendencias quedan para otra entrega.
- **El portón estricto con tendencia compartida no cumple el 1 %.** «Consistente» sigue deshabilitado.
