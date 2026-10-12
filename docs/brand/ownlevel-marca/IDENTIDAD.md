# OWNLEVEL · Identidad de marca

Versión 1 · octubre 2026. Las láminas de referencia están en el canvas de diseño (76 a 82).

## Nombre
**OWNLEVEL.** Se escribe siempre en mayúsculas en el logo. En texto corrido: OWNLEVEL.
Pendiente: registro en el INPI, clases 9 (software) y 41 (servicios de entrenamiento).

## Logo
- **Isotipo 60 A:** una "O" en bloque y una "L" con el palo bajo, ambas inclinadas, con el pie de la L en champagne.
- **Logotipo:** "OWN" en Hanken Grotesk 300 + "LEVEL" en Hanken Grotesk 700, con un espaciado entre letras de 0,2 em. En los archivos ya está convertido a curvas.
- **Versiones:**
  - Horizontal y vertical.
  - Oscuro (blanco + #C9B68A) y claro (#18181B + #7D6A3C).
  - Un solo color, blanco o negro, para fotos y sellos.
- **Tamaño mínimo del isotipo:** 20 px. Por debajo, usar el ícono de la app.
- **No:** cambiar colores, estirar, rotar, ponerle sombras ni escribir el logotipo con otra fuente.

## Ícono de la app
- Isotipo blanco y champagne sobre un degradado grafito (#26262A → #09090B), ocupando el 62 % del ícono.
- **iOS:** versión principal, oscura y teñida. El ícono de vidrio de iOS 26 se arma en Icon Composer con dos capas: la O con el palo de la L, y el pie.
- **Android:** ícono adaptativo con fondo #09090B y versión monocromática.

## Colores
Base grafito y un solo acento champagne. Las tablas completas están en `tema/tokens.ts`.

| Rol | Oscuro | Claro |
|---|---|---|
| Fondo | #09090B | #F3F1EC |
| Tarjeta | #18181B | #FFFFFF |
| Elevado (inputs, chips) | #27272A | #EAE7DF |
| Borde | blanco al 8 % | #E0DCD0 |
| Texto | #F4F4F5 | #18181B |
| Texto secundario | #9F9FA9 | #6A6A72 |
| Acento | #C9B68A | #7D6A3C (texto e íconos) |
| Fondo de acento | champagne al 16 % | champagne al 32 % |
| Hero | degradado #DCCBA3 → #A8935F, texto #1A1710 | igual |
| Error (solo del sistema) | #E5736B | #B4392F |

**Reglas:**
- **Un solo acento.** El champagne es para lo importante: botón principal, serie activa y récord.
- **En modo claro,** el champagne #C9B68A no se usa para texto, porque no se lee.
- **Sin rojo ni verde de "bien/mal"** sobre los datos del usuario. El rojo es solo para fallas del sistema (sincronización, pagos) y para acciones de borrar.
- **Subas y bajas** se marcan con flecha, no con color.

### Colores de rutina · C4

Las claves guardadas identifican rutinas; no califican los datos personales. Solo pintan una tira o un punto de identidad y las muestras del selector de color. Nunca cambian el color de botones, acciones principales ni estados activos: esos siguen usando el único acento champagne. Un color ausente o desconocido no agrega una tira gris ni oculta la rutina.

Decisión aprobada el 12 de octubre de 2026: conservar las ocho claves existentes y remapear sus tonos simultáneamente en Mobile y Web, sin migrar datos. Ampliar a doce claves mediante EXPAND antes de habilitar su elección en Mobile. Arena se parece al champagne, pero conserva exclusivamente el rol de identidad de rutina.

| Clave | Nombre | Claro | Oscuro |
|---|---|---|---|
| violet | Violeta | #6B5BA8 | #A99BD6 |
| indigo | Índigo | #4A5694 | #8E97D0 |
| blue | Azul | #3F6A96 | #7FA3C9 |
| cyan | Celeste | #2F7A72 | #6FB3AA |
| green | Verde | #5E7346 | #9DB07F |
| yellow | Amarillo | #B08A3E | #D4B26A |
| orange | Naranja | #A3573A | #D08C6A |
| rose | Rosa | #9C4A6B | #CF8AA6 |
| sand | Arena | #A8935F | #DCCBA3 |
| stone | Piedra | #8A7F72 | #B8AC9C |
| slate | Pizarra | #5B6B7A | #9AAABB |
| graphite | Grafito | #3F3F46 | #A1A1AA |

El check de selección usa el token de marca con mayor contraste sobre cada muestra, con al menos 3:1. No se presupone que deba ser blanco; los tonos oscuros de interfaz necesitan un check oscuro.

## Tipografía
- **Fuente:** SF Pro (la del sistema) en toda la interfaz. En Android se ve Roboto y en la web la fuente del sistema de cada equipo.
- **Escala de iOS:**

| Estilo | Tamaño / peso |
|---|---|
| Large Title | 34 / 700 |
| Title 1 | 28 / 700 |
| Title 2 | 22 / 700 |
| Headline | 17 / 600 |
| Body | 17 / 400 |
| Subheadline | 15 / 400 |
| Footnote | 13 / 400 |
| Caption | 12 / 500 |

- **Números:** siempre con cifras tabulares (`fontVariant: ['tabular-nums']`), para que no "bailen" cuando cambian.
- **Hanken Grotesk** se usa solo en el logotipo.

## Sistema (77 B · Equilibrado)
- **Radios:**

| Elemento | Radio |
|---|---|
| Tarjeta | 20 |
| Fila o elemento interno | 12 |
| Botón | 14 |
| Chip | 10 |
| Input | 12 |
| Hoja modal | 28 |
| Barra de pestañas | 26 |

- **Espacios:** solo 4, 8, 12, 16, 20, 24, 32 y 40.
- **Medidas fijas:**

| Medida | Valor |
|---|---|
| Margen de pantalla | 16 |
| Relleno de tarjeta | 18 |
| Separación entre bloques | 12 |
| Alto de botón | 50 |
| Alto de input | 48 |
| Alto de fila de serie | 44 |
| Zona táctil mínima | 44 |

- **Barra de pestañas:** flotante, a 16 de los bordes, con vidrio. Cuatro pestañas: Inicio, Rutinas, Entrenar y Progreso.
- **Vidrio:** solo en controles. Va en la barra de pestañas, los botones flotantes, la barra superior al hacer scroll, los controles sobre fotos o gráficos y el temporizador flotante.
- **Sin vidrio:** tarjetas, filas, listas, inputs y el hero.

## Íconos (78 A)
- **Librerías:** SF Symbols en iOS (`expo-symbols`) y Lucide en Android y web, con trazo 2.
- **Tamaños:** 24 en la barra de pestañas, 20 en filas y botones, 17 junto a texto Body.
- **Color:** gris secundario en reposo y acento cuando está activo.

## Pantalla de carga (79 A)
- Solo el isotipo centrado, sobre #09090B (o #F3F1EC en claro), sin texto.

## Movimiento y vibración (80 B · Nativo)
- **Duraciones:** 200 ms en lo rápido y 300 ms en lo normal. Resorte suave sin rebote visible (damping 28, stiffness 240). Al presionar, el elemento se achica al 95 %.
- **"Reducir movimiento":** si el usuario lo tiene activado, todo pasa a fundidos.
- **Vibración por evento:**

| Evento | Vibración |
|---|---|
| Cambiar peso o reps | selección (tic) |
| Terminar una serie | impacto medio |
| Fin del descanso | impacto fuerte |
| Récord | éxito |
| Terminar entrenamiento | éxito |
| Error del sistema | error |

- La vibración se puede apagar desde los Ajustes de la app.

## Tono de los textos (81 B · Compañero de gym)
Cálido y argentino. Frases cortas, alguna exclamación, nunca exagerado.

**Reglas:**
- Voseo siempre.
- Números exactos, en el mismo formato que en pantalla (111,5 kg).
- **Nunca culpa ni presión:** nada de "no te rindas", "rompiste tu racha" o "te estás quedando atrás".
- Sin emojis en la interfaz.
- Las exclamaciones se reservan para logros reales (récord, fin de entrenamiento). Nunca en errores ni en avisos.

**Ejemplos:**

| Situación | Texto |
|---|---|
| Bienvenida | ¡Bienvenido! Arranquemos por cómo venís entrenando, así la app se adapta a vos. |
| Récord | ¡Récord! Sentadilla, 111,5 kg × 5. Eso se trabajó. |
| Sugerencia de carga | Hoy probá con 2,5 kg más en sentadilla. La última vez te sobró. |
| Fin del entrenamiento | ¡Listo! 55 minutos y 18 series. Buen día. |
| Varios días sin entrenar | Hace unos días que no pasás por el gym. Todo bien: la rutina te espera tal cual. |
| Semana floja | Semana cortita: 2 de 4. Pasa. La próxima la arrancamos de nuevo. |
| Recordatorio | Hoy es día de pierna. ¿Vamos? |
| Error | Uy, no pudimos sincronizar. Tranqui: está todo guardado y lo volvemos a intentar. |

## Estados vacíos (82 B · Vista previa de ejemplo)
- La pantalla real con datos de muestra apagados (líneas punteadas y grises) y la etiqueta **EJEMPLO** siempre visible.
- **Debajo:** una frase que explica qué va a pasar ("Con dos entrenamientos esta línea pasa a ser tuya") y el botón principal.
- **Nunca** usar datos de ejemplo con el color de acento ni con números que parezcan reales del usuario.

## Gráficos
- **Un solo dato:** champagne, con el período anterior en gris.
- **Comparar:** máximo 4 series, en este orden:

| Orden | Oscuro | Claro |
|---|---|---|
| 1 | #C9B68A | #7D6A3C |
| 2 | #7FA3C9 | #3F6A96 |
| 3 | #A99BD6 | #6B5BA8 |
| 4 | #D08C6A | #A3573A |

- Cada línea lleva su nombre al final, sin leyenda aparte.
- **Intensidad y calendario:** escala de 5 pasos, del fondo elevado al acento.

## Archivos
- `logo/`, `app-icon/`, `web/` y `splash/`: archivos listos para usar (ver `LEEME.md`).
- `tema/tokens.ts`: fuente única de todos los valores.
- `tema/theme.ts`: tema para Expo.
- `tema/haptics.ts`: vibración.
- `tema/theme.css`: Tailwind v4.
