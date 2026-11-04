## Resumen
Primera versión de la UI de Insights en Mobile (Entrenar → Insights), con los dos métodos siempre separados. **Depende del PR del método parcial.** Base: `codex/367-insights-partial-method`. Decisiones y diferencias: [PLAN](../../bocetos/insights/PLAN.md).

## Cambios
- Fila «Insights» en Biblioteca y rutas `/(tabs)/train/insights` y `/(tabs)/train/insights/[relation]`.
- Resultado con un solo número Hero, contexto, tira por día, días desplegables, vista por ejercicio y relaciones bajo «Para mirar con calma».
- Detalle con frase sin causas, gráfico de pares, grupos, cobertura y días que abren su sesión exacta.
- Estados distintos para vacío, nada comparable, faltan días, sin señal, error y datos contradictorios. Un cero es una marca y un día sin comparación es un hueco.
- El carril parcial siempre lleva su rótulo y su límite. Una relación parcial se muestra como «Coincidieron», y aclara que no sabemos si cambió la variante. Nunca se suman métodos ni aparece «consistente».

## Identidad
Sin tarjetas, champagne solo en la serie, flechas sin color y cifras tabulares. Selector nativo de iOS (Liquid Glass en iOS 26) y barra nativa. Con `fontScale > 1.3`, etiqueta y valor se apilan. Motion 200/300 ms, con fundido si está activo Reducir movimiento. Tic de selección solo al cambiar vista o filtro.

## Costo
Una lectura al abrir, sin prefetch. Las relaciones se piden al tocar «Para mirar con calma» y más días con un botón. Cada pedido usa su vista, y una página de otra revisión no se une a la lista.

## Validación
Pruebas de pantalla y modelo con fixtures construidos por el motor real y pasados por el contrato, `tsc`, `eslint`. **QA física diferida y no aprobada:** no se vio en dispositivo.

## Pendiente
- Fila en el resumen post-entreno y enlace a tendencias de métricas.
- Nombre «Insights»: provisorio.
- Con historial denso, la lectura tarda: ver [costo y escala](367-insights-partial-metodo.md#costo-y-escala).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
