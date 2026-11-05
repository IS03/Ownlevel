## Resumen
Primera versión de la UI de Insights en Mobile (Entrenar → Insights), con los dos métodos siempre separados. **Depende del PR del método parcial.** Base: `codex/367-insights-partial-method`. Decisiones y diferencias: [PLAN](../../bocetos/insights/PLAN.md).

## Cambios
- Fila «Insights» en Biblioteca y rutas `/(tabs)/train/insights` y `/(tabs)/train/insights/[relation]`.
- Resultado con un solo número Hero, contexto, tira por día, días desplegables, vista por ejercicio y relaciones bajo «Para mirar con calma».
- Detalle con frase sin causas, gráfico de pares, grupos, cobertura y días que abren su sesión exacta.
- **Post-entreno:** «Comparar en Insights» abre los hechos de esa sesión. Terminar no lee nada, y abrir no calcula asociaciones.
- **Métrica:** abre sus tendencias, con esa métrica elegida y el mes de ese día. «Volver a Insights» restaura vista, filtro, relaciones y día, o la relación de origen.
- Estados distintos para vacío, nada comparable, faltan días, sin señal, error y datos contradictorios. Un cero es una marca y un día sin comparación es un hueco.
- El carril parcial siempre lleva su rótulo y su límite. Una relación parcial se muestra como «Coincidieron», y aclara que no sabemos si cambió la variante. Nunca se suman métodos ni aparece «consistente».

## Identidad
Sin tarjetas, champagne solo en la serie, flechas sin color y cifras tabulares. Selector nativo de iOS (Liquid Glass en iOS 26) y barra nativa. Con `fontScale > 1.3`, etiqueta y valor se apilan. Motion 200/300 ms, con fundido si está activo Reducir movimiento. Tic de selección solo al cambiar vista o filtro.

## Costo
Una lectura al abrir, sin prefetch. Las relaciones se piden al tocar «Para mirar con calma» y más días con un botón. Una sesión anterior a la primera página pide solo su día. Refrescar la misma lectura conserva los días ya cargados; otra lectura los descarta y lo dice, y las relaciones no se muestran junto a hechos de otra lectura.

**Límites a 10 años, sin resolver:** el detalle de una relación pesa 258 KiB, el pico de memoria es 210 MiB y una lectura cuesta 280 consultas. **Sobre #386 no hay reutilización:** cada pedido es una lectura completa, también abrir Insights al terminar un entrenamiento o ver más días. Con el [ADOPT de la revisión](367-insights-source-revision.md) sería una optimización, no una garantía. La UI no cambia en ningún caso: une páginas por `sourceRevision`, que es fiable en las dos variantes.

## Dependencias
Base: #386, sobre #385. **Sin código de #383 ni de #389.**

| PR | Relación | Sin él |
| --- | --- | --- |
| #383 | Independiente. Captura sensaciones | «Sin registrar» en sensaciones nuevas |
| #389 | Independiente. Requiere la migración de #387 | Las ventanas previas solo cuentan comidas importadas. La UI ya conoce todos los estados |

**Comprobado con una integración temporal local de #390, #383 y #389**, sin publicar y ya borrada: fusionan sin conflictos, `tsc` raíz y Mobile pasan, y las suites de Insights, post-entreno, sensaciones y Progreso pasan (65 en Mobile; 105 en la raíz, 3 omitidas). No es una prueba de los tres desplegados.

## Validación
Pruebas dirigidas de navegación, contexto y solicitudes, con fixtures construidos por el motor real y pasados por el contrato. `tsc` y `npm run lint`. `active-session-bridge-screen.test.tsx` sigue con 4 fallos, los mismos que en `main` (`b5e57e3`).

**QA física diferida y no aprobada:** no se vio en dispositivo, y el cruce de pestañas solo se probó con el router simulado.

## Pendiente
- Al volver, la pila de Progreso conserva la pantalla de tendencias arriba, y el enlace cambia el período compartido de Progreso. Revisar en QA física.
- Nombre «Insights»: provisorio.
- Con historial denso, la lectura tarda: ver [costo y escala](367-insights-partial-metodo.md#costo-y-escala).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
