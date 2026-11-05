# #367 ADOPT — Configuración del ejercicio: captura en Mobile y lectura en Insights

**Base: `main`. Contiene los commits del EXPAND** (`codex/367-exercise-configuration-expand`), así que su diff los muestra hasta que ese PR se mergee. **No mergear antes de aplicar la migración:** el loader de Insights lee la tabla nueva y, sin ella, Insights responde 503.

Reglas: [367-exercise-configuration.md](367-exercise-configuration.md). Matriz de cobertura: [367-matriz-cobertura.md](367-matriz-cobertura.md).

## Qué cambia

### Contrato `training-exercise-configuration/1`

Archivo: `src/lib/mobile-api/training-exercise-configuration-contract.ts`, portable entre API, Web y Expo.

- **Valores:**
  - `null`: desconocida;
  - `recorded` con etiqueta;
  - `not_applicable`.
- **Procedencia:** `entered` o `repeated_previous`, con la fila de origen.
- **Borrar** exige `value: null`. Un campo omitido es inválido.
- **`configurationIdentity`** es lo que compara el motor. Ignora mayúsculas, y lo desconocido sigue en `null`.

### API

`GET` y `PATCH /api/mobile/v1/training/sessions/{id}/exercise-configurations`.

- La identidad sale del token: el body no acepta `userId`.
- Los conflictos dan 409 con código propio: `CONFIGURATION_CHANGED` y `REPEATED_CONFIGURATION_MISMATCH`.
- El cliente Mobile los reconoce como conflicto. Sin eso, un 409 desconocido se leía como resultado incierto y se reintentaba sin fin.

### Insights

- El loader trae la configuración embebida en la misma página de ejercicios: **no agrega un stream**. Siguen siendo 7 + 2 lecturas.
- El comparador no cambió:
  - con configuración conocida, la exposición va al carril estricto;
  - dos conocidas distintas no se comparan;
  - el historial desconocido sigue en el parcial.

### Mobile

**Journal** (`training-exercise-configuration-journal.ts`):
- una escritura a la vez, congelada con su clave antes de enviarse;
- una respuesta perdida o la app cerrada repiten el mismo request;
- un conflicto muestra lo guardado y no reescribe nada;
- un 400 o 404 retira la intención.

**Pantalla:**
- En el ejercicio abierto de la sesión activa aparece una fila «Variante · Sin registrar» con «Registrar».
- **La hoja:**
  - campo de texto, vacío y sin prellenar;
  - «Como la última vez · X», solo si hay un único valor anterior, como elección explícita y con su procedencia;
  - «No aplica»;
  - «Dejar sin registrar».
- Si la lectura falla, la fila lo dice y **entrenar no depende de nada de esto.**

**Sin cambios:**
- autosave de series, finish, corrección y descarte;
- clientes instalados: la pantalla nueva llega con una build, y las versiones anteriores no llaman a esta API.

## Validación

### Raíz
- `tsc` sin errores; ESLint de los archivos tocados.
- `training-exercise-configuration.test.ts`, 11 pruebas:
  - contrato;
  - identidad;
  - journal: respuesta perdida, app cerrada, conflicto, mismo valor y lectura fallida;
  - ruta: identidad del token, 400 antes de la base, 409 y GET.
- `performance-insights.test.ts`, 5 pruebas nuevas:
  - sin stream extra;
  - mayúsculas ignoradas;
  - configuraciones distintas separadas;
  - `No aplica` separado de una etiqueta;
  - lo desconocido en el parcial;
  - borrado leído como desconocido.

### Mobile
- `typecheck` y `lint` limpios.
- Pruebas del cliente: replay exacto y cuatro códigos de conflicto.
- Prueba del componente:
  - sin prellenado;
  - «Como la última vez» con procedencia;
  - texto, No aplica y borrado con revisiones 0, 1 y 2;
  - lectura fallida que no bloquea.

### Suites completas
| Suite | Resultado | Causa de las fallas |
| --- | --- | --- |
| Mobile | 1613 pasan, 4 fallan | `active-session-bridge-screen.test.tsx`. Fallan igual en `main` sin estos cambios, comprobado en un worktree temporal |
| Raíz (`src/lib/mobile-api`, `progress`, `integrations`) | 1190 pasan, 1 falla | `training-session.test.ts` compara literalmente una migración vieja que este checkout tiene con CRLF. No la toqué |

### Base de datos
Reutilizada del EXPAND: 77 aserciones en PostgreSQL descartable. No corrí suites locales contra Supabase con PostgREST, así que **el embebido real (objeto o lista) no está probado contra PostgREST**. El loader acepta las dos formas.

## Límites
- **Sin build ni QA física.** La pantalla llega al teléfono con una build autorizada.
- **La variante solo se registra en la sesión activa.** Editarla en una sesión completada lo acepta la API, pero falta la pantalla.
- **Web no la captura todavía.** Sigue funcionando igual.
- Desde que se registre la primera variante, esa exposición deja el carril parcial y no tiene referencia estricta hasta una segunda sesión igual.
