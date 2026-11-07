# #367 — Energía y fatiga al terminar: diseño secuencial con candidatos anteriores

Diseño y prototipo aislado de un método experimental que trata los dos problemas encontrados en #412 y #417:
- revisiones repetidas sin control;
- candidatos del mismo día que pueden reflejar algo ocurrido después de entrenar.

**No hay validación, no se habilita ninguna asociación y nada llega a las vistas.** Sin migración. El 1 % sigue siendo un objetivo propuesto y «consistente» sigue deshabilitado.

Diseño, límites, futura validación y viabilidad: [367-sensaciones-secuencial-metodo.md](367-sensaciones-secuencial-metodo.md). El diseño se commiteó antes del prototipo (`e5b9f65`).

## Qué propone (`insights-feeling-sequential/1`)

- **Candidatos temporalmente elegibles:** solo los que están demostradamente antes del inicio.
  - Entran: día lógico anterior y comida con hora explícita antes del inicio.
  - Quedan afuera, con su motivo:
    - mismo día sin orden (métricas, nutrición y peso del día);
    - sueño sin noche declarada;
    - sueño con noche declarada, que no demuestra anterioridad a una sesión de madrugada (#419);
    - sensaciones previas.
- **Control de falsos positivos:**
  - máximo de la familia por resultado;
  - α de 0,01 partido entre energía y fatiga;
  - **miradas trimestrales fijas**, con α_k = 0,005 / (k (k + 1)) por resultado. La suma sobre una historia sin fin queda en 0,005, y entre miradas el resultado no cambia.
- **Se conserva** de #412 y #417: unidad, elegibilidad de días, sensaciones ordinales y separadas, marco de la sensación previa, y estratos de rutina × bloque de 42 días.
- **Una sola compuerta**, sin exploratorio sin corregir: p ajustado ≤ α_k, 40 pares, |ρ| ≥ 0,30 y las dos mitades del mismo signo.
- **Resolución y costo:**
  - permutaciones = 10 / α_k, unas 4 000 en la mirada 1 y unas 144 000 en la 8;
  - las compuertas descriptivas se miran primero, y el recorte de Besag y Clifford decide antes de llegar al tope;
  - un candidato detenido devuelve un descarte con dónde se detuvo y una cota explícita de su p, nunca un p sobre permutaciones en las que no se lo contó (#419).

## Revisión de #419

- **Candidatos detenidos:** antes, su p se calculaba con todas las permutaciones de la corrida, también las que siguieron por otro candidato. Ahora cada uno conserva su punto de parada (`stopped.at`) y devuelve un descarte (`stopped_early`) con la cota (h + 1)/(B_k + 1), sin p. Además, solo se detiene cuando esa cota ya supera α_k, aunque se pida un tope menor de permutaciones.
- **Sueño con noche declarada:** queda fuera de este método. Una noche que termina el día D no demuestra anterioridad a una sesión de madrugada de D. El contexto de sueño publicado y las familias públicas no cambian.
- **Reparto de α:** el diseño documenta que no garantiza por sí solo el error total. Depende de que cada prueba sea válida, es decir de la intercambiabilidad, la anterioridad real, una ausencia ignorable y un p de Monte Carlo correcto. Por eso el error total se mide en la validación.
- **Regresiones:**
  - dos candidatos en la misma corrida: uno detenido pronto, con su punto de parada y su cota, y otro que llega al máximo con su p sobre toda la corrida;
  - noche declarada excluida con su motivo;
  - la prueba de recorte, adaptada al descarte.
- **Viabilidad:** las cifras siguen valiendo. La simulación no tiene sueño, y el cambio no altera las permutaciones ni quién pasa.

## Qué cambió en el código

- `feeling-sequential.ts`, nuevo y aislado: elegibilidad, calendario de miradas, gasto de α, permutaciones por mirada con recorte, y el análisis de la mirada vigente.
- `feeling-stratified.ts` (#417): sus funciones internas pasan a exportarse para reutilizarlas, **sin cambio de comportamiento**; sus pruebas dan igual.
- Ninguna vista, contrato ni método publicado cambia.

## Pruebas dirigidas

- elegibilidad: solo bases anteriores, con el motivo de cada candidato afuera, incluida la noche declarada (#419);
- gasto de α: la suma sobre 100 000 miradas queda por debajo de α/2, con los valores y las permutaciones esperados;
- calendario trimestral con fin de mes, y el mismo resultado entre dos miradas;
- la inversa del mismo día no entra en la familia, aunque el método de #417 la marque sobre las mismas filas;
- sin permutar cuando ningún candidato pasa las compuertas descriptivas;
- recorte: se llega al tope solo cuando hace falta, y se decide antes cuando las permutaciones alcanzan al candidato;
- dos candidatos, uno detenido y otro hasta el máximo: cada uno con su propia cantidad de permutaciones, y sin p para el detenido (#419);
- un efecto sembrado del día anterior se encuentra.

## Viabilidad (no es validación)

20 historiales por escenario, todas las miradas, los dos resultados:

| Escenario | Permutaciones por mirada | Algún paso | Análisis más lento |
| --- | --- | --- | --- |
| Independiente | 3 | 0/20 | 63 ms |
| Cambio de rutina | 2 | 0/20 | 42 ms |
| Inversa del mismo día | 4 | 0/20 | 43 ms |
| Efecto del día anterior, moderado | 23 558 | 20/20 (sembrado) | 4,4 s |
| Efecto del día anterior, fuerte | 23 746 | 20/20 (sembrado) | 4,5 s |

- **Con 20 historiales no se puede hablar del 1 %:** 0/20 tiene una cota cercana al 16 %.
- **Costo estimado de la futura validación** (1 000 historiales por escenario): unos 15 minutos para los nueve nulos y unas 5 horas en serie para los dos de potencia.

## Pruebas y validación técnica

- 9 pruebas del prototipo (7 en la primera entrega), más las 5 de #417 sin cambios;
- tipos y lint sin errores.

## Límites

- «Anterior» se refiere a lo que describe el dato, no a cuándo se cargó.
- La ausencia selectiva no se corrige: se informa la cobertura.
- La cota de unión entre miradas y resultados es conservadora y paga potencia, y vale solo si cada prueba es válida bajo sus supuestos.
- El sueño queda afuera hasta que haya una hora de despertar registrada.
- La simulación no tiene todavía comidas ni sueño declarado.
- La medición corre en un bloque síncrono: vitest avisa un tiempo de RPC agotado aunque la prueba pase.

## Pendientes

- **Antes de una validación reservada:** agregar a la simulación comidas con hora explícita, ceder el hilo y fijar una semilla nueva. No se hizo en esta entrega.

Previews bloqueadas para `codex/367-feeling-sequential` en `vercel.json`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
