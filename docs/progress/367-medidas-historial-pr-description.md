# #367 — Historial completo de medidas corporales

Corrige el truncamiento de `listBodyMeasurements` en sus consumidores analíticos, con la misma lectura por páginas que #405 usó para el peso. Solo servidor y Web. **Sin migración, sin cambios de contrato de Mobile y sin tocar Insights.**

## Qué pasaba (confirmado)

- `listBodyMeasurements(1000)` pedía las mediciones de más vieja a más nueva con `limit(1000)`. Con más de 1000, se quedaba con las 1000 más viejas y perdía las recientes:
  - el último valor de cada medida;
  - el período actual y su cambio;
  - la comparación con el período anterior;
  - las diferencias entre lados y las relaciones.
- **Consumidores afectados:**
  - Cuerpo en Web (`train/body/page.tsx`);
  - el informe de Mobile (`progress-sources.ts`, que alimenta `/progress/body` y la vista general);
  - Inicio (`home-server.ts`);
  - Relaciones (`relationships/server.ts`).

## Qué cambia

- **`listAllBodyMeasurements`:** lee todas las mediciones, de más vieja a más nueva, en páginas por `(measured_on, id)`.
- **Unicidad del cursor:** el esquema mantiene una medición por usuario y fecha (`body_measurements_user_date_unique` en `20260813000000_body_measurements.sql`, sin cambios posteriores). Igual, el cursor no depende de eso: con el id como desempate, una fecha repetida no se saltea ni se repite, aunque la restricción cambie.
- **El filtro de página** es `measured_on.gt.D,and(measured_on.eq.D,id.gt.I)`. D e I salen de la última fila leída y se validan como fecha y UUID antes de escribirlos en el filtro.
- **Sin cortes silenciosos:**
  - termina con una página vacía, así que un tope de filas del servidor más bajo que la página no lo corta antes;
  - pasado el máximo (100 páginas), falla;
  - un error en cualquier página es un error, nunca las filas leídas hasta ahí ni un historial vacío.
- **Sospechosas:** vuelven todas. El informe las sigue excluyendo y contando, igual que antes.
- **`listBodyMeasurements(limit)`:** ahora devuelve las `limit` más recientes, de más vieja a más nueva, para quien pide una ventana. Hoy no la usa ningún consumidor analítico.
- **Costo:** una consulta por cada 1000 mediciones más una vacía. Con menos de 1000, dos consultas en lugar de una.

## Qué no cambia

- **Contratos instalados:** `/progress/body` y la vista general mantienen sus claves y su forma. Solo traen los datos recientes que antes faltaban.
- **Referencias de períodos:** el informe recibe el historial completo, así que el período anterior y el primer registro de un período largo siguen disponibles.
- **Insights:** no lee medidas. Sin cambios de métodos ni asociaciones nuevas.

## Validación

- **Nuevas** (`src/lib/body-measurements-read.test.ts`, 6 pruebas, con un PostgREST simulado que respeta filtro, orden, límite y tope de filas):
  - más de 1000 registros (2501), incluidos los más recientes, sin repetir y solo del dueño;
  - 1500 registros en 3 fechas, con un tope de 333 filas: cada borde de página cae dentro de una fecha repetida, sin saltear ni repetir;
  - tope del servidor más bajo que la página;
  - historial vacío distinto de una falla; falla en una página posterior; falla en lugar de truncar;
  - ventana de las más recientes;
  - informe del período más nuevo con más de 1000 registros: ambos límites del período, el período anterior, y una sospechosa del período excluida y contada.
- **Ajustadas:** el orden de `listBodyMeasurements` y los mocks de las pruebas de progreso.
- **Pruebas afectadas:** 330 pasan (medidas, Cuerpo, Inicio, Relaciones, API de progreso de Mobile y Entrenar en Web).
- **Tipos y lint de los archivos tocados:** sin errores ni advertencias.
- Sin campañas, builds, QA física ni migraciones.

Previews bloqueadas para `codex/367-body-measurements-history` en `vercel.json`. QA física diferida, en la [lista única](367-qa-fisica.md).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
