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
- **Nutrición · "Qué cambia hoy":** desglose de cuánto suma cada extra del plan al objetivo y al gasto del día (hoy solo vienen los totales).
- **Métricas · ícono:** campo nuevo en la definición de la métrica (de un set cuidado de íconos: SF Symbols en iOS, Lucide en Android). Hoy solo las 4 del sistema tienen ícono; las que crea cada uno usan uno genérico.
- **Nutrición · momento y hora al cargar:** la carga manual y la rápida no reciben momento (desayuno, almuerzo…) ni hora. Para elegirlos al agregar (bocetos A2 a A4) hace falta sumar `mealLabel` y `consumedAt` a esas escrituras.
- **Nutrición · "Guardar en mis comidas" desde la carga manual:** hoy son dos operaciones separadas (crear comida guardada y registrar). Evaluar una sola escritura atómica o hacerlas en orden, con idempotencia.
- **Nutrición · aviso de duplicado en la carga rápida (opcional):** hoy solo la carga manual detecta "posible duplicado". La carga rápida (guardadas, sugerencias, alimentos) no; por ahora lo cubre el aviso con "Deshacer".
- **Nutrición · editar y borrar comidas que no se cargaron desde la app:** hoy el servidor solo permite editar o borrar comidas con origen `manual` (incluye las de carga rápida). Las que llegan desde ChatGPT, IA, etiqueta o importadas quedan de solo lectura (`MEAL_UNAVAILABLE`), y tampoco los resúmenes históricos. Decidir si se habilita conservando el origen. Mientras tanto, la app ofrece Repetir y Guardar como comida.
- **Nutrición · Repetir una comida:** se puede hacer hoy creando una comida manual con los mismos valores (se pierde el origen y la precisión). Si se quiere conservar el origen, hace falta una operación de servidor.

## Decisiones de marca para registrar en IDENTIDAD.md

- **Vidrio en un panel de contenido:** "Tu día" de Nutrición va en un panel de Liquid Glass (boceto E5). La regla actual dice vidrio solo en controles, nunca en tarjetas. Hay que registrarlo como excepción justificada (es un panel de acciones: cargar métricas y abrir el detalle), con fallback sólido para "Reducir transparencia", Android e iOS anterior a 26.
- **Nutrición sin tarjetas blancas:** contenido directo sobre el fondo con el resplandor champagne (§9c del plan M9), salvo el panel de vidrio de "Tu día".

## Web

- Se rediseña al final, con foco en planificar y enseñar a usar la app, no en entrenar. Mientras tanto se aceptan diferencias con Mobile. Por ejemplo: la Web todavía muestra y usa los valores por defecto del ejercicio, y agregar en una sesión desde la Web también va a arrancar vacío.

## Finalizar entrenamiento · QA de plataforma

- F1–F5 y lectura aditiva de volumen/destacados implementados en M9. Contrato y decisiones: `docs/mobile/m9-finish-redesign.md`.
- Repetir QA en iOS 26 y verificar haptics en iPhone físico: esta máquina solo tiene Simulator iOS 27. El módulo de controles requiere rebuild del development client.
