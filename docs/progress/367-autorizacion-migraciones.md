# #367 — Paquete de autorización de migraciones

**Nada de esto está aplicado.** Producción sigue en `20261104024300_training_feelings_finish_receipt` (historial leído el 2026-11-05). Este documento deja la decisión lista: qué se aplica, en qué orden, cómo se comprueba y qué hacer si falla.

## Qué se autorizaría

| Orden | Migración | PR | Commit | Blob |
| --- | --- | --- | --- | --- |
| 1 | `20261104180000_meal_time_provenance_expand.sql` | #387 | `238cffe23df3fbf9c010ff320978b597c4283738` | `54e431df06a2090f69df049cc09cfc997342bc68` |
| 2 | `20261104190000_insights_source_revision_expand.sql` | #391 | `aff664cb6c88dcc8ea929528f0b99015b6bacf3a` | `25181ddd08295d1c143ba9771d739dcd9150f40e` |

**Los dos blobs son los del paquete anterior: el SQL no cambió.** Solo cambiaron los commits.

Antes de aplicar, comprobar que el archivo sigue siendo ese:

```bash
git rev-parse 238cffe23df3:supabase/migrations/20261104180000_meal_time_provenance_expand.sql
```

```bash
git rev-parse aff664cb6c88:supabase/migrations/20261104190000_insights_source_revision_expand.sql
```

Las dos son aditivas y corren cada una en su transacción. No hacen backfill. Solo dependen de lo que producción ya tiene.

## Qué cambia en producción al aplicarlas

**#387:**
- `meal_entries` gana `consumed_at_source`, nullable. Toma un bloqueo exclusivo breve.
- Un trigger impide que una sesión escriba `raw_input`, importaciones o una declaración de hora. Comprobado en el código: el `INSERT` directo de Web de `main` no escribe esas columnas.
- Cambian las funciones de comidas y aparecen las de ChatGPT v4. Los clientes instalados siguen con su payload y su hash.

**#391:**
- Tablas `insights_source_revisions` e `insights_source_pending`, y triggers diferidos en 8 tablas de entrenamiento, métricas y comidas.
- **Desde ese momento, el commit de cualquier escritura de esas tablas pasa por un bloqueo por cuenta.** Es el único efecto en caliente sobre caminos que ya se usan, aunque nada lea el contador todavía. Una sesión en curso solo anota si cambia a completada o desde ahí, pero sus ejercicios y series sí pasan por la segunda vuelta.

## Orden de integración

`#380`, `#383`, `#385`, `#386` y `#390` ya están en `main` (`26081d9`). Cada PR ya tiene `main` incorporado, y los cinco tienen base `main`:

| PR | Head | Necesita antes |
| --- | --- | --- |
| #387 | `238cffe23df3fbf9c010ff320978b597c4283738` | Migración 1 |
| #388 | `4b9f69adac7e179927b15478f8c650382da6788b` | Migración 1 y #387, cuyos commits contiene |
| #391 | `aff664cb6c88dcc8ea929528f0b99015b6bacf3a` | Migración 2 |
| #392 | `57894ad20c9468792287eb8dbc9f01b003e23996` | Migración 2 |
| #389 | `70c188a01dba6d1870d959ce819e8b645feda545` | Migración 1 |

1. Aplicar la migración de #387.
2. Mergear #387. Su código acepta la declaración opcional, así que requiere la columna.
3. Mergear #388. El `INSERT` de Web escribe la columna y falla sin ella.
4. Aplicar la migración de #391.
5. Mergear #391.
6. Mergear #392 y #389, en cualquier orden.
7. ChatGPT: reimportar el esquema y agregar `time_stated_by_user`, a mano.
8. OBSERVE.

Sin el paso 1, #388 y #389 fallan al escribir o al leer. Sin el paso 4, #392 responde 503.

**El orden lo fijan esas dependencias de la base, no Git.** Simulé el merge secuencial en cuatro órdenes: ninguno da conflictos y los cuatro dan el mismo árbol. Hasta que entre #387, el diff de #388 muestra también sus commits.

**Sacar de borrador los cinco** antes de mergear; hoy los cinco lo están. **Si `main` cambia antes del rollout,** hay que volver a comprobar mergeabilidad y blobs.

## Comprobaciones posteriores

Solo lecturas. **No hacer un finish de prueba ni escrituras sintéticas en la cuenta real.**

```sql
select version from supabase_migrations.schema_migrations where version in ('20261104180000', '20261104190000');
```

```sql
select count(*) as sin_procedencia, count(consumed_at_source) as con_procedencia from public.meal_entries;
```

Debe dar `con_procedencia = 0` antes de ADOPT.

```sql
select tgname, tgrelid::regclass, tgenabled from pg_trigger where tgname in ('insights_source_changed', 'insights_apply_source_change', 'meal_entries_guard_time_source') order by 1, 2;
```

Deben ser 8 `insights_source_changed`, 1 `insights_apply_source_change` y el trigger de comidas, todos `O`.

```sql
select r.rolname, has_table_privilege(r.oid, 'public.insights_source_pending', 'select,insert,update,delete'), has_sequence_privilege(r.oid, 'public.insights_source_pending_id_seq', 'usage,select,update') from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role');
```

Debe dar falso en todo.

```sql
select count(*) from public.insights_source_pending;
```

Debe dar 0 siempre.

**Advisor de Supabase:** seguridad y rendimiento, sin hallazgos nuevos.

**OBSERVE**, durante unos días de uso normal, sin contenido de las comidas:
- `40P01` y `55P03` en Postgres.
- 503 de `performance-insights`.
- Duración de los commits de escritura de entrenamiento.
- Tamaño de `insights_source_pending` y actividad de autovacuum.
- Proporción de `user_declared` y `null` por productor.

## Ante un fallo

| Qué pasa | Qué hacer |
| --- | --- |
| La migración falla al aplicar | Corre en una transacción: no queda nada. No reintentar a ciegas: leer el error |
| Fallan escrituras de comidas tras #387 | No mergear #388. Ver si es el trigger. Si hay que quitarlo, usar la reversión de abajo |
| Aparecen `40P01` o esperas largas tras #391 | No mergear #392. Revertir con la reversión de abajo: ningún código lee todavía el contador |
| Fallan lecturas de Insights tras #392 o #389 | Revertir el merge en `main` y dejar que despliegue. Las migraciones se quedan |

**No hacer un rollback destructivo como mecanismo de rutina.**

## Qué se puede revertir y qué no

| | Reversible | Costo |
| --- | --- | --- |
| Trigger, funciones y tablas de #391 | Sí, con la reversión del encabezado de la migración, después de quitar el código que lee | Se pierde el contador. Sin consecuencias: empieza de nuevo y una lectura solo se rehace |
| Trigger y funciones de #387 | Sí, con la reversión del encabezado, reaplicando las definiciones anteriores | Hay que hacerlo en ese orden |
| Columna `consumed_at_source` | Técnicamente sí | **La procedencia escrita desde el EXPAND no se puede reconstruir.** No borrarla |
| Un `merge` en `main` | Sí, revirtiéndolo | Normal |

## Evidencia y límites

**Sobre la versión exacta de producción, Postgres `17.6.1.105`, con el candidato en `83d4458`.** Fuera de la documentación, el árbol final difiere de ese en dos archivos: `vercel.json` y `performance-insights.local.test.ts`, que perdió aserciones y no ganó ninguna. El SQL y el código de la aplicación son los mismos:

| Suite | Resultado |
| --- | --- |
| Migración de #391 anterior a la corrección | Las 2 pruebas con gancho dan `40P01`: las pruebas detectan el fallo también en esta versión |
| Cruce con token | 29 pasan, con 3 rondas en las que no usan gancho |
| Revisión | 42 pasan |
| Integración | 11 pasan |
| ADOPT integrado | 6 pasan, 1 omitida (escala) |
| Finish con recibo | 35 comprobaciones |

En esas corridas con la versión final no hubo deadlocks. Todos los 500 son esperados: el `40001` de reordenar vistas cruzado y el fallo sintético del recibo.

**Sobre Postgres 17.11, en corridas anteriores:**
- #391 en `d20ff78`: limpieza en commit, rollback y desconexión, parada limpia y caída.
- #392 en `5065a98`, su árbol exacto: 5 pruebas y 1 omitida.
- #387: 46 pruebas, con usuarios reales y RLS. **No se repitió** sobre 17.6.

**No garantiza ausencia general de deadlocks.** Cerró los cruces reproducidos. El orden de la cola entre vueltas es comportamiento observado en 17.6.1.105 y 17.11, no una garantía confirmada en el manual. Una actualización de Postgres debería repetir las pruebas de cruce.

**Sin validar:**
- Carga real y escritores concurrentes a escala.
- El `ALTER TABLE` con los datos de producción.
- Réplicas de lectura y restauración a un punto en el tiempo.
- Un GPT real.
- Las pilas locales usan datos sintéticos, no el volumen ni la distribución reales.
- La suite local de #392 y la de #389 no se repitieron en sus heads nuevos: esos heads agregan `main` y los cambios de este rollout, y el SQL no cambió. `performance-insights.local.test.ts` no corrió contra una base después de su último cambio: sus aserciones restantes pasaron antes, en #389 y en el candidato.
- `supabase/tests/ownlevel_oauth_meals.sql` falla igual con y sin #387, y no se investigó la causa.


## Qué cambió frente al paquete anterior

| | Antes | Ahora |
| --- | --- | --- |
| Blobs de las migraciones | | Iguales |
| Código de la aplicación | | Igual |
| `vercel.json` de #387, #388, #391 y #392 | Listas distintas: #391 chocaba con #387 y #388, y #392 duplicaba una clave al mezclarse con #391 | Un bloque idéntico en los cuatro. #389 no toca ese archivo |
| Imports del test de #389 | Chocaban con los de #392 | Sin conflicto |
| Test de #389 | Fijaba `14 + 7` consultas y que no hay reutilización. Git lo mezclaba con #392 sin avisar, y el test habría fallado en `main` al correrlo con una base local | Comprueba la ventana y la respuesta nueva. Costo y reutilización siguen probados en #392 |
| Bases de #388, #389 y #392 | Apiladas | `main`, cambiadas desde ChatGPT |

## Descripciones de GitHub

**Las de GitHub siguen sin actualizar:** esta máquina no tiene sesión para editarlas. Dicen bases viejas en #388, #389 y #392. El texto vigente está en cada rama; al pegarlo, los enlaces relativos tienen que pasar a absolutos:

| PR | Archivo |
| --- | --- |
| #387 | `docs/progress/367-meal-time-provenance-expand-pr-description.md` |
| #388 | `docs/progress/367-meal-time-provenance-adopt-pr-description.md` |
| #391 | `docs/progress/367-insights-source-revision-expand-pr-description.md` |
| #392 | `docs/progress/367-insights-source-revision-adopt-pr-description.md` |
| #389 | `docs/progress/367-insights-meal-source-pr-description.md` |
