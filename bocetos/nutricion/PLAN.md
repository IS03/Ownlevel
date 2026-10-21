# Nutrición (Mobile): plan por partes

Los bocetos están en esta carpeta (PNG). Estilo de todas las partes: **E5** (`01-E5-home-elegida.png`).
- Contenido plano sobre el fondo con el resplandor champagne, sin tarjetas blancas.
- "Agregar comida" es un botón de vidrio a todo el ancho.
- "Tu día" va en un panel de Liquid Glass, que es una excepción de marca anotada en `bocetos/PENDIENTES.md`.

Cada paso es un PR propio y se prueba en el iPhone antes del siguiente.

| Paso | Qué | Bocetos | Servidor |
|---|---|---|---|
| 1 | **Home del día** | E5, N2, N3, N8–N10, N14 | Nada. Si la semana o el mes no salen de lecturas existentes, se reporta como bloqueado |
| 2 | **Métricas del día**: tocar una celda, hoja de carga (Sumar/Reemplazar/Quitar), guardado con Deshacer | M1–M3 | Nada (las escrituras de métricas ya existen) |
| 3 | **Agregar comida**: menú de vidrio (A mano, Rápido, Alimento por cantidad), Rápido con "+" en línea, Alimento con porción, A mano, posible duplicado, Deshacer | G1–G4, A2–A6 | EXPAND: momento y hora en las escrituras. Sin el EXPAND se hace sin el selector de momento |
| 4 | **Detalle y edición de comida**: detalle, comida de ChatGPT de solo lectura, editar, gestos (deslizar para eliminar, mantener apretado) | D1–D4 | Nada |
| 5 | **Detalle del día**: "Qué cambia hoy" / "De dónde sale" | N11, N12 | EXPAND: el desglose de cuánto suma cada extra del plan |
| 6 | **Biblioteca**: comidas guardadas y alimentos, con el estilo E5 | (sin boceto: se reestilan las pantallas actuales) | Nada |
| 7 | **Ajustes › Métricas** (lista y editor con ícono) | M4, M5 | EXPAND: campo ícono. Va junto con el diseño de Ajustes |

El plan nutricional, la energía y los datos físicos se mudan a Ajustes, y el reporte a Progreso, cuando se diseñen esas pantallas (ver `bocetos/PENDIENTES.md`). Mientras tanto se abren desde el menú `•••` (N3).
