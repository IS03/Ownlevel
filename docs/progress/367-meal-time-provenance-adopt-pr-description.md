## Resumen
ADOPT de la [procedencia de la hora](367-meal-time-provenance.md) en los clientes.

**Base: `codex/367-meal-time-provenance-expand`. No mergear antes de aplicar la migración:** el insert de Web escribe la columna nueva y fallaría sin ella.

## Cambios
- **Mobile:** declara `user_declared` solo desde la hoja de hora o el campo de hora, incluso si se vuelve a elegir el mismo valor. Abrir una edición, cambiar el momento, mover de día o repetir una comida no declaran nada.
- **Web:** `createMealEntry` registra `default_clock` si nadie pasó una hora.
- **ChatGPT:** documentado el paso manual de volver a importar el esquema y agregar `time_stated_by_user` a las instrucciones. Lo hace la persona dueña del GPT.

## Validación
Suite de nutrición de Mobile (31 suites), `tsc`, `eslint`. **QA física diferida y no aprobada.**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
