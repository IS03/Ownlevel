# Progreso · etapa 3: Qué influye (plan por partes)

Bocetos aprobados el 15/10: `bocetos/que-influye/` (T1–T6, fila y=23000 de `bocetos.entrenar.pen`). Galería: https://claude.ai/artifact/Rp5QQ1XNW8sHVWhJnwonE2

Base: etapas 1 y 2 (período y comparación compartidos, Explorar, Mis vistas).

## Decisiones (aprobadas)

- **Una pregunta compara dos grupos de días.** Se separan por una medida (arriba / abajo de la mediana, un corte propio, o sí / no para entrenamiento y trabajo). Se mira otra medida el mismo día, el día siguiente o 2 días después.
- **Mínimos:** 14 días con los dos datos y 5 en cada grupo. Con menos, no hay números, solo cuántos días hay y cuántos faltan.
- **Evidencia en tres niveles, sin colores:** poca, moderada o clara. La calcula el servidor.
- **Nunca causas ni consejos.** Siempre aparece "Es una relación, no una causa". Las preguntas listas no tratan el peso como objetivo.
- **Por dónde se entra:** desde Progreso (debajo de Lo destacado) y desde Explorar.
- **El aviso automático** (etapa 4) se muestra solo con 30 días o más y evidencia clara, como mucho uno por semana, y se puede descartar.

## Pasos

| Paso | Qué | Bocetos | Servidor |
|---|---|---|---|
| 1 | **Lectura "qué influye"** (solo servidor y contrato) | — | EXPAND de lectura, sin migración |
| 2 | **Qué influye en la app:** preguntas, una respuesta, armar tu pregunta, cómo separar los días, pocos datos; entradas desde Progreso y Explorar | T1–T5 | Usa el paso 1 |
| 3 | **Fijar una pregunta en Mis vistas** | T2 | La definición de una vista suma `kind: "influence"` (jsonb; sin migración). Validación en el contrato |
| 4 | **Etapa 4: aviso automático** en Lo destacado, con descarte | T6 | EXPAND con migración: descartes por usuario |
