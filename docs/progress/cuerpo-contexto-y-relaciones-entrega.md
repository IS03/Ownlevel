# Cuerpo: entrega para revisión de Claude

Base: `c2ef8fa19d0bb2fb292dccaa2dfe25415c5f439a`. Rama: `codex/body-context`.
Plan: [cuerpo-contexto-y-relaciones-plan.md](cuerpo-contexto-y-relaciones-plan.md).

## Implementado

- El comparador existente ahora prioriza las últimas fechas con una misma medida comparable; si no hay, los últimos pesajes. Compara solamente valores del mismo campo en fechas exactas. Nunca mezcla medidas antiguas sin lado con las laterales.
- Diferencias en kg/cm separadas, duración, aviso de intervalo corto y advertencia junto a perímetros. Equivalente semanal descriptivo solo desde 21 días, sin extrapolar; cambios inferiores a la precisión mostrada no se presentan como cero.
- Peso semanal de referencia opcional: dos semanas completas y cerradas, fechas/cantidad de pesajes y mediana canónica con mínimo de tres. Dos lecturas de siete días, bajo demanda; no modifica ni sustituye los valores exactos.
- Contexto entre registros: excluye ambos extremos por desconocer su hora. Nutrición muestra promedios, denominadores propios de cada nutriente, sumas parciales y objetivos históricos; etapas con sus fechas efectivas; entrenamiento con sesiones, series, duración y grupos; selector de métricas personales, incluidas archivadas.
- El desglose conserva un solo grupo por ejercicio. No establece relaciones cintura-abdominales ni atribuye tejido a los contornos. No hay medidas nuevas de hombros/espalda.
- En el detalle de una medida: contexto temporal opcional, por defecto calorías. Gráficos con mismo período, escalas propias y selección compartida. Nutrición usa días reales; las otras series conservan sus buckets y explican cuándo representan intervalos. Fecha sin observación corporal no toma un valor cercano.
- Accesos a comidas y registros de métricas con retorno explícito a Cuerpo; historial de sesiones sin cambiar el período compartido. El acceso al historial no filtra automáticamente el intervalo: sus fechas permanecen visibles en el contexto.
- Lecturas con caché existente por cliente/cuenta, rango y variable, invalidación por escrituras y estados de error separados de ausencia. Cerrar los controles no provoca escrituras.

## Adaptaciones al plan

- Se conserva el período compartido vigente al entrar, incluido su comportamiento de mes calendario. No se fuerza una nueva selección de 30 días sobre un período que la persona ya eligió.
- El selector del contexto entre registros agrupa Entrenamiento en una sola opción, evitando tres entradas con el mismo resumen. En los gráficos sí se eligen series, sesiones o duración por separado.
- Se reutilizan exclusivamente contratos actuales: **sin endpoint nuevo, migración ni modificación de la respuesta de Cuerpo**. Tampoco se cambian escrituras, CAS, RLS o datos históricos.
- No se retiran los cálculos de Qué influye/Lo que se movió junto ni se activa el experimento semanal descartado.

## Verificación

- `npm run validate`: tipos, lint, 275 suites / 2.879 pruebas y configuración, aprobado durante el desarrollo.
- Tras el último pulido: tipos/lint y seis suites enfocadas (26 pruebas), incluyendo retorno de comidas/métricas, fechas, coberturas, huecos, medianas, etapas y coste de inspección del gráfico.
- Bundle iOS de desarrollo cargado desde este checkout en Metro 8091. Sin build, instalación ni modificación de OWNLEVEL Diario.
- En simulador, mediante Computer Use: apertura de Cuerpo, comparación de registros consecutivos sin contexto inventado, cambio del intervalo con cobertura nutricional parcial, etapa histórica y desglose de entrenamiento con sus reglas.
- La automatización perdió acceso a la ventana durante el tramo final. No se acredita recorrido nativo completo de medianas semanales, los nuevos retornos, claro/oscuro, Dynamic Type ni Reduce Motion. Estos recorridos tienen cobertura automatizada parcial y conservan pendiente la comprobación visual nativa. No se acredita QA física.
- No hubo escrituras de datos personales durante QA. Las pruebas usan fixtures; no se guardaron datos personales en estos documentos.

## Dónde revisar

- `body-context-model.ts`: reglas descriptivas puras, fechas y referencias semanales.
- `body-context.tsx`: lectores por demanda y presentación de contexto/series.
- `body-atlas.tsx` y `body-trends-screen.tsx`: integración en recorridos existentes.
- Navegación de Nutrición/Métricas: retorno a la medida corporal retenida.

La señal científica sigue siendo descriptiva: coincidencias, diferencias y cobertura; no causalidad, composición corporal o reparto de kilos entre zonas.
