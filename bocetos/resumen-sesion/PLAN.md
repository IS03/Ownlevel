# Sesión terminada · recién terminás y volver a verla

Decisión del 17/10. Bocetos: `bocetos.entrenar.pen` (y = 35600, 36750 y 37900) y los PNG de esta carpeta. Los elegidos son SF1, SF2 y SF3; el resto son opciones descartadas.

## Dos momentos

### 1. Recién terminás (reemplaza "Entrenamiento guardado", `post-workout-screen.tsx`)
- **Animación (de PW3):**
  - Arriba, la semana de lunes a domingo. El día de hoy se llena con un háptico de éxito y aparece "N esta semana", en unos 1,2 s.
  - Después la semana sube a su lugar y entra la página.
  - Con "Reducir movimiento", todo aparece con un fundido.
- **Página (de PW2), en este orden:**
  1. "PUSH guardado" y la línea de datos (fecha, duración, series, kg). La semana solo aparece en la animación; no queda en la vista.
  2. Un bloque destacado en champagne:
     - **con récord:** "¡N récords hoy!", el ejercicio, el número grande y "Antes: …";
     - **sin récord, pero algo mejoró:** "Mejor que la última {rutina}", cuántos subieron y cuáles;
     - **si nada mejoró:** el bloque no aparece.
  3. Lo que mejoró (↗) y lo que se sumó a la rutina, hasta 3 renglones.
  4. Cómo te sentiste, en puntos (energía y rendimiento sobre 5, dolor sobre 10), en un bloque suave. Solo lo que se cargó.
  5. "Listo" y "Ver sesión".
- Bocetos: SF2 (con récord) y SF3 (sin récord).

### 2. Volver a verla (la sesión completa, `completed-session-view.tsx`)
- **Arriba (de SR1), sin tarjetas:**
  - fecha y horario, y el nombre grande;
  - la frase: "24 series en 1 h 34 min.", y en champagne "2 récords y 3 ejercicios mejor que la última vez." (solo lo que es cierto);
  - una línea con los kg y los ejercicios completados;
  - cómo te sentiste, en puntos.
- **"A dónde fue el trabajo" (de SR3):** series por grupo muscular, con barras desde cero. La principal en champagne y el resto en champagne suave.
- **Ejercicios:**
  - Cada renglón tiene el nombre, las series en línea ("90×10 · 90×9 · 90×8 kg") y, a la derecha, cómo le fue frente a la última vez: "↗ 1 rep", "récord 20 kg", "=" o "primera vez". El trofeo marca los récords.
  - Al tocar un renglón se despliega:
    - el detalle del ejercicio;
    - cada serie con "antes …" de la última vez y la etiqueta "récord" donde corresponda;
    - la nota;
    - "Ver historial del ejercicio".
- Se mantienen el menú `•••` (corregir, descartar) y el resto de las acciones de hoy.
- Boceto: SF1.

## Reglas
- Champagne solo para lo que es logro real (récord, mejora). Las bajas van con flecha, sin color de "mal".
- Las exclamaciones van solo en récords.
- No hay frases forzadas: si nada mejoró, no se inventa nada.
- "Faltar no es cero":
  - un ejercicio sin sesión anterior es "primera vez", no "↗ todo";
  - un sentimiento no cargado no se muestra.
- Números con cifras tabulares y formato de pantalla (9.887 kg; 17,5).

## Datos
- Ya existen:
  - el detalle de la sesión, con ejercicios, series, grupo muscular de cada ejercicio, horarios y metadata;
  - los highlights (récords y mejoras con su marca anterior);
  - la semana de hábitos (`GET /progress/habits/week`).
- Falta, con un EXPAND sin migración:
  - para cada ejercicio de la sesión, cómo le fue frente a la última vez que se hizo ese ejercicio antes de esta sesión: `improved | same | declined | first` y la diferencia principal (kg o reps);
  - las series de esa vez anterior, para el "antes" de cada serie.
- Propuesta: ampliar la lectura de highlights, o crear `GET /api/mobile/v1/training/sessions/{id}/summary`, con parser estricto. La anterior es la sesión completada más reciente con ese ejercicio antes de esta; las descartadas no cuentan.

## Pasos

Estado (17/10): pasos 1–3 hechos (#277, #278 y #279). Del paso 4 se hizo el QA en simulador (#280); falta el QA en el teléfono con un entrenamiento real.

Ajuste sobre el plan: si el mejor set empata, decide el total del ejercicio (kg × reps, o reps totales). Así un set principal que se mantuvo mientras el resto bajó no se muestra como "=".
1. **Servidor:** la lectura de comparación por ejercicio (EXPAND, sin migración), con contrato y tests.
2. **App, volver a verla (SF1):**
   - la frase;
   - los sentimientos en puntos;
   - músculos;
   - la lista desplegable con el "antes".
3. **App, recién terminás (SF2/SF3):**
   - la animación de la semana;
   - la página con el bloque destacado;
   - los estados con récord, sin récord y sin mejoras.
4. **QA físico.**
