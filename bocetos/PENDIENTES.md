# Pendientes del rediseño (M9)

Lista viva de lo que sacamos de una pantalla para llevarlo a otra, y de los cambios de servidor que fueron apareciendo. Se actualiza en cada sesión de bocetos. Bocetos: `bocetos/bocetos.entrenar.pen`.

## Va a Ajustes (cuando lo diseñemos)

- **Plan nutricional** (hoy "Configurar nutrición" en Nutrición):
  - Objetivo por día de la semana (kcal y proteína).
  - Agua.
  - Extra por entrenamiento (kcal y agua).
- **Energía** (hoy en "Configurar nutrición"): nivel de actividad, BMR, base automática o personalizada, extra.
- **Datos físicos** (hoy en "Configurar nutrición"): nacimiento, sexo, altura y peso.
  - Hoy aparecen textos técnicos ("Configuración heredada. Guardar adopta V2", "Sexo male", "Actividad moderate") que hay que reescribir.
- **Métricas:** crear, editar, archivar, eliminar y reordenar, **con ícono** (bocetos M4 y M5).
  - Hoy esto se abre desde Progreso › Métricas.
  - El orden es el que se ve en Inicio y en Nutrición.
- **Carga rápida por métrica** (futuro): que cada uno configure su valor rápido (por ejemplo, "vaso de 250 ml") y el botón de la métrica pase a decir "+ 250 ml".
- Vibración: ya está en Ajustes (M9.1C).

## Va a Progreso (cuando lo diseñemos)

- **Reporte nutricional:** mientras tanto se abre desde Nutrición › `•••` › Reporte, y desde "Ver reporte" del calendario de Nutrición.
- **Análisis grande por ejercicio:** el historial de un ejercicio queda con un gráfico chico; el análisis completo va en Progreso.
- **Tendencias de métricas** y de nutrición (promedios largos y comparaciones).
- **Bocetos de Progreso hechos (15/10, `bocetos/progreso/`, P1–P6):** el reporte nutricional pasa a P4 y el análisis por ejercicio a P3. Cuando se implementen, sacar "Reporte" del `•••` de Nutrición.

### Se va de Progreso (bocetos P1–P6)
- **"Explorar" y "Revisar datos":** duplicaban las filas de "Tus áreas".
- **Historial:** vive en Entrenar.
  - El Historial general (`/history`: calendario con cuerpo, métricas y nutrición por día) quedó sin entrada directa desde el paso 2 de Progreso (15/10). Se sigue llegando a sus días desde los gráficos de Cuerpo y Métricas. Decidir si se suma a Entrenar o se retira.
- **"Métricas diarias" (cargar y editar el día):** la carga de hoy ya está en Nutrición › "Tu día". La edición de días pasados va con el editor de Nutrición, y "Administrar métricas" va a Ajustes.
- **Selector de período de 7 chips:** queda Semana, Mes, 3 meses y Año, y "Personalizado" pasa al `•••`. Hay que confirmar que el servidor acepte esos presets: hoy acepta 7/14/30 días, 3/6 meses, 1 año y personalizado, así que "Semana" sería 7 días y "Mes" 30.

## Queda en su sección, pero dentro de un menú

- **Nutrición › `•••`:** Comidas guardadas, Alimentos, Reporte (temporal) y Plan nutricional (temporal, hasta que exista en Ajustes).

## Se sacó (decisión tomada)

- "Restaurar plan inicial" de rutinas, en Mobile. El endpoint y la Web quedan como están.
- Valores por defecto del ejercicio (series, reps, peso, RIR, descanso) en Mobile: el ejercicio es solo "qué es". La base no se toca.
- Página "Por día" de "Esta semana" en Inicio: la reemplaza "Hábitos".

## Cambios de servidor pendientes (EXPAND)

- **Rutinas:** duplicar, reordenar y 4 colores nuevos (sand, stone, slate, graphite). Ver `rutinas-biblioteca/PROMPT-codex.md`.
- **Sesión en curso:**
  - agregar ejercicio arranca vacío;
  - "Sumar a {RUTINA}" al finalizar;
  - `routineId` y filtro por rutina en el historial del ejercicio.
  - Ver `sesion-agregar-historial/PROMPT-codex.md`.
- **Inicio · Hábitos:** confirmar que el resumen de Progreso tenga exactamente la semana de Inicio. Si no la tiene, EXPAND. Ver `inicio/PROMPT-codex.md`.
- **Historial:** intensidad relativa del calendario, si se decide calcularla en el servidor. Ver `historial/PROMPT-codex.md`.
- ~~**Nutrición · "Qué cambia hoy":**~~ HECHO (15/10, M9 paso 5): `breakdown` opcional en la lectura del día, resuelto en TypeScript sin migración. Incluye base, aportes de entrenamiento/trabajo configurados y modo del gasto; solo se publica para hoy si las fuentes pertenecen al usuario, no cambiaron después del snapshot y ambos totales cierran. Los ajustes manuales, históricos sin snapshot de la base, fuentes no disponibles, origen de entrenamiento ambiguo en reglas anteriores y reglas no aditivas devuelven `null`. Queda afuera guardar snapshots de la base para explicar días pasados y descomponer interacciones entre factores; requiere otro EXPAND.
- **Métricas · ícono:** campo nuevo en la definición de la métrica (de un set cuidado de íconos: SF Symbols en iOS, Lucide en Android). Hoy solo las 4 del sistema tienen ícono; las que crea cada uno usan uno genérico.
- ~~**Nutrición · momento y hora al cargar:**~~ HECHO (15/10, migración `20261015031555_mobile_meal_timing_expand`): la carga manual y la rápida aceptan `mealLabel` y `consumedAt` opcionales; sin ellos todo queda igual que antes.
- ~~**Nutrición · "Guardar en mis comidas" desde la carga manual:**~~ HECHO (misma migración): registrar y guardar van en una sola operación con una sola clave.
- **Nutrición · aviso de duplicado en la carga rápida (opcional):** hoy solo la carga manual detecta "posible duplicado". La carga rápida (guardadas, sugerencias, alimentos) no; por ahora lo cubre el aviso con "Deshacer".
- **Nutrición · editar y borrar comidas que no se cargaron desde la app:** hoy el servidor solo permite editar o borrar comidas con origen `manual` (incluye las de carga rápida). Las que llegan desde ChatGPT, IA, etiqueta o importadas quedan de solo lectura (`MEAL_UNAVAILABLE`), y tampoco los resúmenes históricos. Decidir si se habilita conservando el origen. Mientras tanto, la app ofrece Repetir y Guardar como comida.
- **Nutrición · Repetir una comida:** se puede hacer hoy creando una comida manual con los mismos valores (se pierde el origen y la precisión). Si se quiere conservar el origen, hace falta una operación de servidor.

- **Progreso · comparación libre:** "Elegir rangos" compara dos períodos cualquiera (boceto Q2). Confirmar que la lectura de Progreso acepte un rango de comparación explícito; si no, EXPAND de lectura.
- **Progreso · "Cuándo comés" (boceto Q5):** calorías y proteína por franja horaria (Mañana 5–11, Mediodía 11–15, Tarde 15–20, Noche 20–2), contando solo las comidas con hora. Hoy no hay lectura agregada por franja: EXPAND de lectura.
- **Progreso · lectura de estadísticas general (etapa 2):** medida × desglose × filtro × rango, para Explorar, Mis vistas y Qué influye. Probablemente lleve migración (agregaciones e índices).

## Decisiones de marca para registrar en IDENTIDAD.md

- **Vidrio en un panel de contenido:** "Tu día" de Nutrición va en un panel de Liquid Glass (boceto E5). La regla actual dice vidrio solo en controles, nunca en tarjetas. Hay que registrarlo como excepción justificada (es un panel de acciones: cargar métricas y abrir el detalle), con fallback sólido para "Reducir transparencia", Android e iOS anterior a 26.
- **Nutrición sin tarjetas blancas:** contenido directo sobre el fondo con el resplandor champagne (§9c del plan M9), salvo el panel de vidrio de "Tu día".

## Web

- Se rediseña al final, con foco en planificar y enseñar a usar la app, no en entrenar. Mientras tanto se aceptan diferencias con Mobile. Por ejemplo: la Web todavía muestra y usa los valores por defecto del ejercicio, y agregar en una sesión desde la Web también va a arrancar vacío.

## Finalizar entrenamiento · QA de plataforma

- F1–F5 y lectura aditiva de volumen/destacados implementados en M9. Contrato y decisiones: `docs/mobile/m9-finish-redesign.md`.
- Repetir QA en iOS 26 y verificar haptics en iPhone físico: esta máquina solo tiene Simulator iOS 27. El módulo de controles requiere rebuild del development client.

## Nutrición · Biblioteca · QA de gestos

- Paso 6 implementado. Listas, búsqueda, filtros, crear/editar, archivar/restaurar, menú nativo del editor y acciones de accesibilidad verificados en Simulator iOS 27, en claro y oscuro. Los registros creados para QA quedaron archivados.
- Repetir en iPhone el gesto físico de mantener apretado y deslizar: el puente de Device Hub de esta sesión rechaza arrastres/coordenadas con `noWindowsAvailable`. La acción de deslizar se probó automáticamente (cierra el gesto y pide confirmación antes de archivar); el menú nativo y las acciones accesibles se probaron en Simulator.
