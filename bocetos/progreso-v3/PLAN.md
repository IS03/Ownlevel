# Progreso (Mobile): plan por partes

Bocetos: `bocetos/progreso-v3/` (ronda 2, R1–R6) y `bocetos/progreso-v2/` (Q4 Entrenamiento y Q6 1RM estimado siguen valiendo). Galería: https://claude.ai/artifact/Rp5QQ1XNW8sHVWhJnwonE2

Estilo: el de Nutrición (E5). Todo plano sobre el fondo con el resplandor, separado por líneas finas, sin tarjetas blancas ni bordes redondeados. El vidrio va solo en controles (barra de período, Comparar, chip de comparación, botones).

Cada paso es un PR propio y lo probás en el iPhone antes del siguiente.

## Lo que hay hoy en el servidor (para planificar)

- Las lecturas de Progreso (`overview`, `body`, `metrics`, `training`, `training/exercise`) reciben `period` (7, 14, 30, 3m, 6m, 1y o custom con `from`/`to`, hasta 366 días).
- La comparación es siempre contra el período anterior de igual largo (`previousStart`/`previousEnd`). No se puede pedir otro rango.
- Ya existen las series por período (entrenamiento por semana, métricas, peso) y el reporte nutricional día por día.

## Pasos

| Paso | Qué | Bocetos | Servidor |
|---|---|---|---|
| 1 | **Período y comparación (base de todo).** Barra de período deslizable (Semana, Mes, 3 meses, 6 meses, Año, Personalizado), "‹ Octubre 2026 ›" con flechas y gesto, hoja Personalizado con calendario de rango, hoja Comparar con un calendario (A/B), estado compartido entre todas las pantallas de Progreso, título que sube a la barra y período fijo al scrollear | R1–R4 | **EXPAND de lectura:** `compare` opcional (`none`, `previous`, `last_year`, o `from`/`to` explícito). Sin `compare` = sin comparación. Semana, Mes y Año son de calendario (lunes a domingo, 1 al último día, enero a diciembre), mandados como `custom` |
| 2 | **Progreso principal.** "Tu octubre": progreso dentro del rango (del inicio al fin: "83,3 → 81,2 kg") con mini gráficos; con comparación, el gris y las flechas. "Lo destacado". Sacar "Explorar" y "Revisar datos" | R1, R2 | Nada nuevo (usa el paso 1) |
| 3 | **Entrenamiento:** volumen por semana, desglose por Músculo / Rutina / Ejercicio, ejercicios que mejoraron dentro del período (primera contra última sesión), cómo te sentiste | Q4 | Revisar si "mejoraron dentro del período" sale de lo que hay; si no, EXPAND de lectura chico |
| 4 | **Un ejercicio:** mejor serie, 1RM estimado (Epley, siempre marcado "estimado") y volumen; sesiones del período | Q6 | El 1RM se calcula en el servidor desde la mejor serie y se marca como derivado |
| 5 | **Nutrición en Progreso:** día por día con objetivo y comparación al lado (reemplaza el reporte del `•••` de Nutrición) y **"Cuándo comés"** por franjas (Mañana 5–11, Mediodía 11–15, Tarde 15–20, Noche 20–2), solo con las comidas con hora | R5, R6 | **EXPAND de lectura:** calorías y proteína por franja horaria |
| 6 | **Cuerpo y Métricas** con el mismo patrón (dentro del rango, comparación opcional) | P5, P6 adaptados | Nada nuevo |
| 7 | **Etapa 2: Explorar y Mis vistas** (medida × desglose × filtro, fijar vistas arriba) | por diseñar | **EXPAND grande:** lectura de estadísticas general, probablemente con migración |
| 8 | **Etapa 3: Qué influye** (cruces con desfase de días y preguntas listas) | por diseñar | Usa la lectura del paso 7 |
| 9 | **Etapa 4: avisos automáticos**, solo con muchos datos y diferencias claras | por diseñar | Usa la lectura del paso 7 |

## Reglas que cruzan todos los pasos

- **Sin comparar por defecto.** La comparación es opt-in, se mantiene al navegar entre pantallas de Progreso y se saca desde cualquiera.
- **Datos fieles:** sin dato ≠ 0 (huecos, no ceros); coberturas visibles; nada de colores de bueno o malo, solo flechas neutras.
- **Calendario de rango:** reusar el calendario propio de Entrenar (pinta días, rápido). El calendario nativo de iOS no pinta rangos con dos colores. Si no queda bien, la alternativa es un selector nativo "desde / hasta".
- **Lo que se mueve:**
  - "Métricas diarias" (cargar y editar) pasa a Nutrición › "Tu día" y a Ajustes;
  - Historial vive en Entrenar;
  - al terminar el paso 5, se saca "Reporte" del `•••` de Nutrición.
