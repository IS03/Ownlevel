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

## Costo
- Consultas sin cambios: `P + 14` por intento. El loader no se tocó.
- Cálculo máximo: 134 ms a 1 año, 1,10 s a 5 años, 6,4 s a 10 años.
- Respuesta por defecto: 122, 177 y 241 KiB. **Desde 5 años queda fuera de los objetivos de 1 s y 128 KiB.** Hay una propuesta sin aplicar para reducir el tamaño.

## Validación
Comparador estricto (67 pruebas) sin cambios en sus expectativas, 20 pruebas nuevas del método, calibración reproducible, `tsc` y `eslint`. Sin datos reales.

## Pendiente
Regla de producto de captura, presupuesto de riesgo. «Consistente» sigue deshabilitado.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
