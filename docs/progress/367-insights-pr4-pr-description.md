Motor de Insights para #367: loader agrupado de todo el historial, read model puro compartido, endpoint optativo y calibración sintética reproducible. Refs #367.

**Borrador. Sin UI, migraciones, datos personales, deploys ni builds.** No depende de código exclusivo de #383 ni de #380. Las sensaciones nuevas solo aparecen cuando #383 esté integrado.

## Estado con datos reales

**Hoy el motor no compara nada.** La configuración histórica no existe y el método publicado exige conocerla, así que todo queda en `insufficient_comparison / missing_context`, sin días de resultado ni asociaciones. La ventana de comidas solo cuenta las importadas con hora. Hace falta una decisión antes de PR 5: [propuesta de EXPAND y metodología parcial](docs/progress/367-insights-expand-propuesta.md).

## Qué cambia

- `GET /api/mobile/v1/progress/performance-insights`, con identidad del token y sin cambios en contratos existentes.
- `src/lib/progress/insights-engine`: hechos, contexto y asociaciones en carriles separados, sobre el comparador existente.
- Toda métrica numérica por UUID, incluidas archivadas, sin inferir por nombre ni unidad. Nutrición registrada y carbohidratos con hora comprobable. Energía y fatiga pre independientes; post solo como contexto.
- Máximo estado publicable: «exploratorio». `promotion.status = not_enabled`.
- Propuesta de diseño para PR 5 en `bocetos/insights/`.

## Correcciones de la revisión

- **Procedencia horaria:** una hora es `explicit` solo con marca positiva, que hoy solo escribe la importación. Sin metadata, inválida o ambigua queda `unverified`. El helper legacy no cambia.
- **Configuración:** el adaptador conserva `null`. Se quitó `not_captured_by_product`.
- **Binarias y empates:** elegibilidad (`sparse_variation`) separada de los grupos, que respetan los dos valores reales y los empates, sin mirar el resultado.
- **Costo:** `P + 14` por intento y hasta `4(P + 14)` con ambos reintentos, medido contra la ruta.

## Resultados medidos

Calibración con 1000 historiales nulos por escenario, 12 actualizaciones anuales. Compuerta estricta interna, no publicada:

| Escenario | Compuerta estricta | Wilson sup. 95 % |
| --- | --- | --- |
| Independiente | 0,0 % | 0,38 % |
| Dependencia temporal | 0,3 % | 0,88 % |
| Tendencias espurias | 0,8 % | 1,57 % |
| Cambios de rutina | **1,8 %** | **2,83 %** |
| Outliers | 0,0 % | 0,38 % |
| Ausencia selectiva | 0,0 % | 0,38 % |
| 40 candidatos correlacionados | 0,3 % | 0,88 % |
| Binaria, un tercio de los días | 0,1 % | 0,56 % |
| Binaria rara, 5 % de los días | 0,0 % | 0,38 % |
| Escala 1 a 5 con empates | 0,2 % | 0,73 % |
| Binaria con cambios de rutina | **1,4 %** | **2,34 %** |

**El objetivo del 1 % no está aprobado y hoy no se alcanza en todos los escenarios.** Por eso «consistente» no existe en el contrato. Efecto plantado: 41 % moderado, 99,9 % fuerte y 92,4 % en binaria.

Los escenarios continuos no se repitieron con 1000: con 100 historiales por escenario dan idéntico a `f839f29`. La calibración mide la política estadística, no el motor con datos reales.

Escala, solo cálculo, a 5 años: 123 ms y 90 KiB con los datos de hoy; 807 ms y 108 KiB con captura. A 10 años con captura supera los objetivos propuestos (4,9 s, 147 KiB, 239 MiB).

Consultas por lectura: 96 a 5 años, 192 con un reintento y 384 en el peor caso.

PostgREST local real a 5 años, con menos series que el perfil sintético: 74 consultas. Lectura de 313–351 ms con estadísticas y de 2,8–2,9 s sin ellas, casi todo por la revisión de `workout_sets`. No representa la latencia de producción.

## Cambios en el comparador

Sin cambios de resultados: opción `exclusionDetail: "summary"`, menos huellas y normalización memoizada. Los 67 tests pasan.

## Revisar especialmente

- **Contexto parcial:** se propone como método aparte, sin implementar.
- **Ventana de 3 h:** es una decisión de producto; 2 h y 4 h solo se muestran como sensibilidad.

Detalle completo en `docs/progress/367-insights-pr4-motor.md`.

## Pendientes

Decisión de configuración, EXPAND de hora de comida, presupuesto de riesgo, estratificación por rutina y PR 5. Sin ejecutar en producción ni sobre datos reales. #367 sigue abierto.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
