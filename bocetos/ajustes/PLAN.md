# Etapa siguiente · Cuenta, Ajustes y primera vez

Plan del 16/10, después de cerrar Nutrición (PR #252). Lo que falta para que la app esté completa antes del Release (M9.5): cómo entrás, quién sos, cómo configurás tu plan y cómo te vas.

## Qué hay hoy

- **Entrada:** una pantalla con "Continuar con Google". No hay bienvenida ni primera vez: una cuenta nueva cae en un Inicio vacío.
- **Ajustes:** una lista larga con un editor de nombre lleno de textos técnicos ("Revisar mi borrador con este valor", "Comprobar intento guardado"). Tiene filas para Perfil físico, Plan nutricional, Métricas diarias, tema, vibración, cerrar sesión y versión.
- **Plan nutricional, energía y datos físicos:** viven en un editor viejo que se abre desde Nutrición › `•••` y desde Ajustes, con textos internos como "Configuración heredada. Guardar adopta V2", "Sexo male" o "Actividad moderate".
- **Métricas:** se administran desde Ajustes › Métricas (crear, editar, archivar). Sin íconos propios ni orden.
- **No existe:** Sign in with Apple, eliminar la cuenta desde la app, una primera vez guiada.

## Lo que hay que resolver (y por qué)

1. **Requisitos de App Store** (bloquean el Release):
   - **Sign in with Apple:** Apple lo exige si la app ofrece otro login de terceros (Google). Guideline 4.8.
   - **Eliminar la cuenta desde la app** (Guideline 5.1.1(v)).
   - **Link a la política de privacidad.**
2. **Primera impresión:** una cuenta nueva tiene que entender qué es OWNLEVEL y quedar configurada (nombre, datos físicos, plan, métricas) en menos de 2 minutos, sin pantallas de formulario largas.
3. **Ajustes sin jerga:** todo lo que hoy dice "intento", "lectura", "V2", "male" se reescribe con el tono de la marca.
4. **Pendientes de `PENDIENTES.md` que llegan a Ajustes:** plan nutricional por día, agua, extra por entrenamiento, energía, datos físicos, métricas con ícono y orden, carga rápida por métrica (futuro).

## Bocetos (una mañana, en `bocetos/ajustes/` y la galería del celular)

Cada lámina va con una descripción corta en texto para revisarla desde el celular. Ideas propias marcadas con ✦ (se pueden descartar).

### A · Entrada
- **A1 · Bienvenida.** Isotipo y una frase de la marca sobre fondo con el resplandor champagne. Dos botones: "Continuar con Apple" (negro/blanco según tema, como pide Apple) y "Continuar con Google". Abajo, en chico: términos y privacidad.
- **A2 · Volviendo.** Mismo lienzo, con "Hola de nuevo" cuando el dispositivo ya conoce la cuenta. ✦ Sin pantalla intermedia: si la sesión sigue viva, la app abre directo.
- **A3 · Error de entrada.** Neutro, sin culpa: qué pasó y "Probar de nuevo".

### B · Primera vez (DIFERIDA el 16/10: se diseña cuando existan los demás configurables)
- **B1 · ¿Cómo te llamamos?** Un solo campo, nombre prellenado de Google o Apple.
- **B2 · Tu cuerpo.** Nacimiento, sexo, altura y peso en ruedas nativas, todo en una pantalla. Explica en una línea para qué se usa (calcular tu gasto).
- **B3 · Tu objetivo.** Tres tarjetas: bajar, mantener, subir. Muestra el plan sugerido (kcal y proteína) con los números grandes y "Ajustar" para tocarlos.
- **B4 · Qué querés registrar.** Métricas sugeridas (agua, pasos, sueño) con su ícono, para activar con un toque.
- **B5 · Listo.** Resumen y "Empezar". ✦ Un primer "logro": "Tu plan está listo" con los aros de Nutrición llenándose una vez.
- Todo usa escrituras que ya existen (nombre, configuración nutricional, métricas). Sin datos inventados: si salteás, queda "sin dato".

### C · Ajustes
- **C1 · Ajustes (inicio).** Arriba, ✦ **tarjeta de perfil**: foto de la cuenta (Google/Apple), nombre, email y una línea "Entrenás con OWNLEVEL desde marzo" (solo si el dato existe). Debajo, grupos con íconos SF Symbols:
  - **Tu plan:** Plan nutricional · Energía · Datos físicos.
  - **Registro:** Métricas (con orden e íconos).
  - **App:** Apariencia (tema) · Vibración.
  - **Cuenta:** Cuenta conectada · Cerrar sesión · Eliminar cuenta.
  - **Acerca de:** Versión · Privacidad · Diagnóstico.
- **C2 · Perfil.** Nombre editable en el lugar (sin "borrador"), foto y email de la cuenta, proveedor ("Entrás con Apple").
- **C3 · Plan nutricional.** Objetivo por día de la semana como 7 columnas tocables (kcal y proteína), agua y extra por entrenamiento. ✦ "Igual todos los días" como interruptor que colapsa las 7 columnas en una.
- **C4 · Energía.** Gasto base automático o propio, nivel de actividad en lenguaje simple ("Trabajo sentado", "De pie gran parte del día"…), con el número resultante a la vista.
- **C5 · Datos físicos.** Mismas ruedas que B2.
- **C6 · Métricas.** Lista con ícono, arrastrar para ordenar (el orden es el de Inicio y Nutrición), archivadas al final. Editor con selector de íconos (set cuidado). ✦ Vista previa de cómo se ve en Inicio.
- **C7 · Eliminar cuenta.** Pantalla honesta: qué se borra, que no se puede deshacer, confirmar escribiendo "ELIMINAR". Sin culpa ni presión.
- **C8 · Estados.** Sin conexión, guardando, guardado (los mismos patrones de Nutrición: botón con indicador, aviso de vidrio).

## Implementación (Codex, un paso por PR)

| Paso | Qué | Backend |
|---|---|---|
| 1 | Ajustes C1 + Perfil C2 (tarjeta, grupos, nombre en el lugar, copy nuevo) | No |
| 2 | Plan nutricional, Energía y Datos físicos (C3–C5) en Ajustes, con copy nuevo; Nutrición › `•••` abre lo mismo | No (mismas escrituras) |
| 3 | Métricas con ícono y orden (C6) | **EXPAND:** columnas `icon` y `position` en la definición, con CAS |
| 4 | Entrada A1–A3 + Sign in with Apple | **Configuración:** proveedor Apple en Supabase y capability en Apple Developer (lo hace el usuario); en la app, `expo-apple-authentication` y rebuild |
| 5 | Eliminar cuenta (C7) | **EXPAND:** endpoint `DELETE /api/mobile/v1/account` con identidad por Bearer, borrado en orden con service role solo en el servidor, idempotente; decidir qué pasa con la Web |
| 6 | (Diferido) Primera vez B1–B5 | No (usa las escrituras existentes); marca de "primera vez completa" local + en el perfil si se quiere en varios dispositivos (**EXPAND opcional**) |
| 7 | ✦ Carga rápida por métrica ("+ 250 ml") | **EXPAND:** `quick_value` en la definición |

Orden pensado para no bloquearse: 1 y 2 no tocan el servidor; 3 y 5 llevan migración (aplicar a "gym" solo con autorización); 4 necesita pasos del usuario en Apple y Supabase.

## Decisiones tomadas (16/10)

- **Primera vez (B):** se deja para después, cuando existan los demás configurables. No entra en esta etapa.
- **Eliminar cuenta:** borra todo, también la Web/PWA (es la misma cuenta).
- **Sugerencias "Para vos" de Rápido:** siguen ocultas.
- **Foto de perfil:** la de la cuenta (Google o Apple); no se suben fotos.

## Láminas hechas (16/10 · `bocetos.entrenar.pen`, fila y=24000 y 25300; PNG en esta carpeta)

| Lámina | Qué muestra |
|---|---|
| AJ1 · Ajustes | Tarjeta de perfil con historia (desde cuándo, entrenamientos, récords) y grupos Tu plan · Registro · App · Cuenta · Acerca de, con el valor actual en cada fila |
| AJ2 · Perfil | Foto de la cuenta, nombre editable en el lugar con "Listo", email y proveedor de solo lectura |
| AJ3 · Plan nutricional | Semana en 7 columnas (kcal arriba, proteína abajo), "Igual todos los días", agua y extra si entrenás; rige desde hoy |
| AJ4 · Cambiar un día | Hoja con kcal y proteína grandes y "Aplicar también a" con chips de días |
| AJ5 · Energía | Automática / La pongo yo; gasto por día con la cuenta (reposo + actividad); actividad con ejemplos de la vida real; "Si entrenás, gastás" |
| AJ6 · Datos físicos | Ruedas nativas en el lugar; sexo en palabras; peso desde Cuerpo (se carga acá solo si no hay registros) |
| AJ7 · Eliminar cuenta | Qué se borra, que no se deshace, confirmar escribiendo ELIMINAR |
| AJ8 · Métricas · ordenar | Sobre M4: mantener y arrastrar, con acciones de VoiceOver |
| AJ9 · Carga rápida | Sobre M5: porción por métrica ("+ 10 páginas"); un toque en Inicio suma eso |
| EN1 · Bienvenida | Pantalla oscura con el logo real, Apple y Google, términos y privacidad |
| EN2 · Volviste | "Continuar como Nacho" con la cuenta recordada y "Usar otra cuenta" |
| EN3 · No se pudo entrar | Aviso neutro arriba de los botones |

M4 y M5 (ronda de Nutrición) siguen valiendo para la lista y el editor de métricas.

## Ronda 2 (16/10) · estilo y etapas

Pedido: sin tarjetas blancas, estética de la Web, más innovación; el plan nutricional guardado en etapas para comparar en Progreso; entrada con animación de ola.

| Lámina | Qué muestra |
|---|---|
| AJ-A · Editorial | Titular con tu momento ("vas por la semana 3 de 12 de tu déficit"), avance de la etapa y renglones grandes con el dato en champagne |
| AJ-B · Tu línea | Bloque grafito arriba con tu identidad y tus etapas como línea de tiempo; resto en dos columnas sobre el fondo |
| AJ-C · Tus números | "Lo que sabemos de vos": cada ajuste es su número grande (comés, gastás, pesás…), se toca para cambiarlo |
| ET1 · Etapas del plan | Ahora / próxima / antes; cada etapa con nombre, tipo, fechas y objetivo por día; las pasadas no se reescriben; duplicar |
| ET2 · Comparar etapas | En Progreso: peso con franjas por etapa y tabla por etapa (objetivo, comiste, peso por semana con flecha, entrenos, días con datos) |
| EN-A · La ola | Grafito con ola champagne que se mece; al entrar sube como cerveza en un vaso (burbujas y espuma) y se funde en Inicio |
| EN-B · Anillos | Fondo claro, titular grande; los anillos de la app se llenan al entrar y pasan a ser los de Inicio |

### Etapas: qué hay y qué falta (servidor)

- Hoy el plan ya se guarda por período (`nutrition_plan_periods`, `effective_from` + `name`) y los días guardan el período que usaron. Falta:
  - **tipo de etapa** (mantenimiento, déficit, superávit, propia) y **fecha de fin** opcional;
  - **programar** una etapa futura (hoy el plan rige solo desde hoy);
  - **duplicar** una etapa;
  - lectura de Progreso **por etapa** (objetivo, comido, cambio de peso por semana, entrenos, cobertura).
- Es un **EXPAND** con migración (columnas nuevas, función de lectura); los días pasados no cambian. Va como paso propio antes del plan nutricional en Ajustes.

## Ronda 3 (16/10) · cómo se configuran las etapas y más entradas

- **Estilo elegido para Ajustes:** AJ-A (editorial: titular negro grande con tu momento, renglones con el dato en champagne). Falta pulir y pasar el resto de las pantallas a este estilo, con datos realistas.
- **Etapas, dos formas de usarlas en la misma pantalla (ET3):**
  - **Cambiar desde hoy:** el que decide sobre la marcha. El plan actual se cierra y el nuevo arranca hoy, sin fecha de fin, hasta que lo vuelva a cambiar.
  - **Programar etapas (ET4):** el que planifica. Secuencia de tramos con tipo, duración (− / +) y objetivo sugerido; las fechas se encadenan solas; se elige qué pasa al terminar (seguir en la última o pasar a mantenimiento).
  - **Planes típicos** que arman la secuencia en un toque: volumen y definición, recomposición, definir para el verano.
  - Lo vivido nunca cambia: editar o cortar una secuencia solo toca lo que no empezó.
- **Entrada:** EN-C (barras que suben escalonadas, como subir de nivel) y EN-D (las palabras entran de a una, el anillo se dibuja, gira mientras conecta y se cierra al entrar). Siguen EN-A (ola) y EN-B (anillos) como alternativas.
