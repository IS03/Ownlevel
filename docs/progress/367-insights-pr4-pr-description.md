Motor de Insights para #367: loader agrupado de todo el historial, read model puro compartido, endpoint optativo y calibración sintética reproducible. Refs #367.

**Borrador. Sin UI, migraciones, datos personales, deploys ni builds.** No depende de código exclusivo de #383 ni de #380. Las sensaciones nuevas solo aparecen cuando #383 esté integrado; hasta entonces, esos candidatos quedan en «datos insuficientes».

## Qué cambia

- `GET /api/mobile/v1/progress/performance-insights`, con identidad del token y sin cambios en contratos existentes.
- `src/lib/progress/insights-engine`: hechos, contexto y asociaciones en carriles separados, sobre el comparador existente.
- Toda métrica numérica por UUID, incluidas archivadas, sin inferir por nombre ni unidad. Nutrición registrada y carbohidratos con hora explícita. Energía y fatiga pre independientes; post solo como contexto.
- Máximo estado publicable: «exploratorio». `promotion.status = not_enabled`.
- Propuesta de diseño para PR 5 en `bocetos/insights/`.

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

**El objetivo del 1 % no está aprobado y hoy no se alcanza en todos los escenarios.** Por eso «consistente» no existe en el contrato. Efecto plantado: 41 % moderado, 99,9 % fuerte.

Escala, solo cálculo: 873 ms y 104 KiB a 5 años. El perfil intenso de 10 años supera los objetivos propuestos (4,5 s, 141 KiB, 479 MiB).

PostgREST local real a 5 años: lectura de 568–623 ms y cálculo de 723–797 ms. No representa la latencia de producción.

## Cambios en el comparador

Sin cambios de resultados: opción `exclusionDetail: "summary"`, menos huellas y normalización memoizada. Los 67 tests pasan.

## Revisar especialmente

- **Configuración:** el producto no la captura. Se usa `not_captured_by_product` y el contrato lo declara.
- **Hora explícita:** si `consumed_at` coincide con `created_at`, se trata como hora por defecto.
- **Ventana de 3 h:** es una decisión de producto; 2 h y 4 h solo se muestran como sensibilidad.

Detalle completo en `docs/progress/367-insights-pr4-motor.md`.

## Pendientes

Decisión del presupuesto de riesgo, estratificación por rutina y PR 5. Sin ejecutar en producción ni sobre datos reales. #367 sigue abierto.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
