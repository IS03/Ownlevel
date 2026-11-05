## Resumen
Agrega `insights-performance-partial/1` y `insights-engine-partial/1` como un método separado, para usar el historial mientras no exista configuración histórica. El método estricto conserva su semántica. Detalle: [método parcial](367-insights-partial-metodo.md).

**Depende de #385.** Base: `codex/367-insights-pr4-engine`. Sin migraciones ni escritura de datos.

## Cambios
- Compara mismo UUID, modo, unidad e implemento históricos, con configuración desconocida en ambos lados. Nunca lee el catálogo ni escribe `none`.
- Cada exposición cae en un solo método, así que ninguna observación es comparable en los dos.
- Lecturas `higher_record`, `same_record` y `lower_record`. El carril no usa mejora, descenso ni capacidad.
- Asociaciones con familia, ids `partial:`, resultado y corrección propios. No pueden promoverse.
- El contrato rechaza un carril sin sus rótulos.

## Calibración (1000 historiales por escenario; no se mezcla con la estricta)
Los cambios no registrados son supuestos, porque el dato real no existe.

| Cambios por exposición | Lecturas que cambian | Se invierten | Compuerta estricta | Wilson 95 % |
| --- | --- | --- | --- | --- |
| 0 % | 0,0 % | 0,0 % | 0,0 % | 0,38 % |
| 5 % | 2,9 % | 1,0 % | 0,0 % | 0,38 % |
| 15 % | 8,8 % | 3,2 % | 0,2 % | 0,73 % |
| 30 % | 17,5 % | 6,3 % | 0,0 % | 0,38 % |

**Límite importante:** si la variante cambia junto con la exposición, la compuerta estricta pasa en 44,7 % de los historiales y el exploratorio en 77,9 %. El método no puede distinguirlo de un efecto real. Por eso se rotula siempre, nunca se presenta como causa y no se promueve. El objetivo del 1 % sigue sin aprobar.

**Publicación:** por ese límite, pasar la compuerta en este método se publica como `coincidence_context_unknown`, nunca como `exploratory`, y no aparece hasta que se pide la lista.

## Costo
El endpoint separa [vistas](367-insights-partial-metodo.md#vistas-y-reutilización): resumen, días, relaciones y una relación. Sin historial truncado y con los mismos resultados. **Cada vista es una lectura completa:** quité la reutilización del diseño anterior porque `count + max(updated_at)` no identifica todos los cambios, y con dos transacciones reales mostraba 10 con la base en 11. Ver [revisión de las fuentes](367-insights-source-revision.md).

| A 10 años | Antes | Ahora |
| --- | --- | --- |
| Primera pantalla, cálculo | 6,4 s | 877 ms mediana, 1,03 s máximo |
| Primera pantalla, respuesta | 241 KiB | 123 KiB |
| Más días | Lectura y cálculo completos, 280 consultas | Lectura completa, 280 consultas, sin permutaciones |

**Sigue fuera de presupuesto a 10 años:** una relación pesa 258 KiB, el pico de memoria es 210 MiB y cada lectura cuesta 280 consultas.

**El control durante una lectura es de mejor esfuerzo:** no detecta el cambio de una transacción que empezó antes y confirma después de otra más nueva. Una prueba deja escrito ese límite. La revisión transaccional va en un PR aparte.

## Validación
Comparador estricto (67 pruebas) sin cambios en sus expectativas, equivalencia del resumen en 120 historiales aleatorios, vistas contra el modelo completo, huella de resultados idéntica, reproducción con dos transacciones contra PostgREST local real, `tsc` y `eslint`. Sin datos reales. No se repitió ninguna campaña: ni la compuerta ni los resultados cambiaron.

## Pendiente
Regla de producto de captura, presupuesto de riesgo. «Consistente» sigue deshabilitado.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
