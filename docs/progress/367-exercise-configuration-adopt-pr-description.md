# #367 ADOPT — Configuración del ejercicio: captura en Mobile y Web, lectura en Insights (#395)

**Base: `main`. Contiene los commits de #394**, así que su diff los muestra hasta que #394 se mergee.

**No mergear antes de aplicar la migración:** el loader de Insights lee la tabla nueva y, sin ella, Insights responde 503.

- Reglas: [367-exercise-configuration.md](367-exercise-configuration.md).
- Rollout: [367-exercise-configuration-rollout.md](367-exercise-configuration-rollout.md).
- Matriz: [367-matriz-cobertura.md](367-matriz-cobertura.md).

## Captura

| Dónde | En curso | Completada |
| --- | --- | --- |
| Mobile | Fila «Variante» en el ejercicio abierto | Sección «Variantes» en la sesión completada |
| Web | Bloque «Variante» bajo la nota de cada ejercicio, en el editor de sesión | El mismo bloque, con la sesión completada |

**Una sola semántica.** Contrato, ruta Bearer, RPC, revisión, journal y textos son los mismos en las dos plataformas. Los textos y la detección de bloques mezclados viven en el contrato y el journal compartidos.

**Qué hace:**
- **Nunca prellena.** Las opciones son escribirla, «No aplica», «Como la última vez · X» o «Dejar sin registrar».
- **«Como la última vez» es una elección explícita** y guarda su procedencia, que el servidor comprueba.
- **Lo registrado o corregido con la sesión completada dice «registrada después».** Esa fase la pone el servidor (`recorded_phase`), y el cliente no puede declararla.
- **El texto de ayuda no promete una comparación:** dice que para compararla hace falta una sesión anterior con la misma variante.
- **Bloques repetidos:** si el mismo ejercicio aparece dos veces en la sesión con otra variante, desconocida incluida, cada fila avisa que así no se compara. El motor lo marca como `mixed_context`.
- **Entrenar y finalizar nunca dependen de la variante.**
  - Una lectura fallida lo dice.
  - Una escritura sin confirmar queda pendiente con su clave y se repite igual.
  - Un conflicto muestra lo guardado.

**Sin cambios:**
- autosave de series y su token CAS (la tabla es otra);
- recibos de finish, corrección y descarte;
- historial desconocido, sin backfill;
- métodos y denominadores separados.

## Insights

- **Lectura:** el loader trae la configuración embebida en la misma página de ejercicios, así que no agrega un stream. **PostgREST la devuelve como objeto, o `null` sin fila**: lo comprobé en 17.6. El loader acepta también una lista.
- **Carril estricto:** una configuración conocida lleva la exposición al estricto, y dos configuraciones distintas no se comparan.
- **Carril parcial:** lo desconocido sigue ahí.

## Validación

### PostgreSQL 17.6 + PostgREST + Auth

Archivo: `exercise-configuration.local.test.ts`, **5 pruebas, todas pasan**.
- RLS entre cuentas; escritura directa rechazada (`42501`); lectura anónima rechazada.
- RPC:
  - CAS;
  - replay exacto de una respuesta perdida (`replayed=true`);
  - clave reutilizada con otro cuerpo;
  - campo omitido;
  - borrado explícito;
  - No aplica.
- «Como la última vez»: valor anterior ofrecido, fila con otro valor o de una sesión posterior rechazada, y fase `after_session` en una sesión completada.
- Forma real del embebido: objeto, o `null` sin fila.
- Recorrido escritura → loader → comparador:
  - variantes iguales en dos sesiones dan `improved` contra la anterior;
  - dos variantes en una sesión dan `mixed_context`;
  - el carril parcial queda vacío.
- **Invalidación:** corregir la variante de una sesión completada mueve el contador. La lectura siguiente tiene otra revisión y la comparación cambia.

### Raíz
- `tsc` y ESLint de lo tocado.
- **Contrato y journal (12 pruebas):** fase solo en lo guardado; replay; app cerrada; conflicto; mismo valor; lectura fallida; ruta.
- **Loader (5 pruebas nuevas).**
- **Componente y puerto Web (9 pruebas):**
  - desconocida;
  - registrada después;
  - aviso de bloques;
  - lectura fallida;
  - estados HTTP;
  - Bearer del usuario.
- Pruebas del editor de sesión Web.

### Mobile
- Cliente y componente, 10 pruebas:
  - sin prellenado;
  - «Como la última vez» con procedencia;
  - texto, No aplica y borrado con revisiones 0, 1 y 2;
  - lectura fallida;
  - sesión completada con «registrada después» y aviso de bloques.
- `npm run validate`: `typecheck` y `lint` limpios; 1614 pruebas pasan y 4 fallan en `active-session-bridge-screen.test.tsx`, igual que en `main` sin estos cambios. `config:check` corrido aparte.

### Reutilizado y no repetido
- La evidencia de #394 en 18.6 embebido.
- Las 8 pruebas afectadas de #391 y las 3 guardas de cruce, en 17.6.
- **No se repitieron** las suites completas ni la campaña estadística: el método, sus supuestos y la política de publicación no cambiaron.

## Límites
- **Sin build ni QA física.** Mobile llega al teléfono con una build autorizada y Web con el deploy.
- **Web usa los controles del editor actual,** que todavía no está migrado a la marca (M9.4).
- **La fase separa durante y después,** pero el comparador usa las dos. No afirma que una variante se capturó durante el entrenamiento.
- **Primera variante:** desde que se registra la primera, esa exposición deja el carril parcial y no tiene referencia estricta hasta una segunda sesión igual.
