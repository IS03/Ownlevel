Captura opcional de energía/fatiga pre/post en Web y Expo, con journal persistente por usuario/sesión y recuperación después de salir o reiniciar. Refs #367.

**Borrador: QA física pendiente.** #384 ya está mergeado y publicado, y su migración aplicada; esta rama incorpora main sin cambiar ese backend. No se inicia PR 4.

## Qué cambia

- **Captura:** pre compacto y omitible; post dentro del formulario final, con significado «cómo terminaste». Cuatro valores independientes 1–5, sin defaults, con anclajes y posibilidad de quitar. Rendimiento, dolor y notas siguen separados; la energía histórica no se transforma ni se escribe como alias de post.
- **Journal:** antes de enviar se persisten intención, cuerpo, procedencia, CAS y clave. Web y Expo usan Mobile API con identidad del token. Un conflicto real exige releer y resolver expresamente; un fallo de lectura no aparece como ausencia confirmada.
- **Finish con sensaciones:** las intenciones nuevas negocian `training-feelings-finish/2` con `?routineAdditions=1` y el mismo cuerpo v1. El resumen Mobile usa el snapshot original, aunque falle detail o cambie la rutina. No hay fallback a un segundo finish.
- **Intenciones v1 pendientes:** conservan ruta, cuerpo y clave. No se enriquecen ni se inventan adiciones.
- **Web Locks:** un lock ausente, rechazado o que lanza error publica un aviso recuperable y conserva la intención. Web nunca continúa sin lock.

## Integración tras el rollout de #384

- Merge de `origin/main` (`b5e57e3`) sin conflictos. Backend, migraciones, runner y documento de #384 quedan idénticos a main.
- Migración canónica: `20261104024300_training_feelings_finish_receipt.sql`. Reemplaza el nombre preparado `20261104040000`, con el mismo SQL.
- **Corrección demostrada:** desde `aa461ec`, el finish Web liberaba los bloqueos también tras confirmar. Hasta que llegara el refresh, «Finalizar» y la edición quedaban activos, y un segundo toque podía congelar otra intención contra una sesión cerrada. Ahora solo se liberan si el intento no confirma.
- Nueva prueba de una intención v1 durable a través del controlador Mobile.

## Evidencia

### Local (datos sintéticos y transporte simulado)

- Tipos raíz/Mobile, lint focalizado y `config:check` correctos.
- Suites afectadas repetidas: **92 pruebas raíz en 7 suites** y **14 pruebas Mobile en 3 suites**.
- Reutilizadas sin repetir: 35 comprobaciones Auth/PostgREST y advisor local de #384, 63 regresiones del controlador y evidencia DB de #382.

### Alojada sin identidad (solo lectura o rechazo, sin escrituras)

- Vercel: producción `dpl_D43P4qzqMsCBErcYF7xF2FxuJjRU` en `READY` para `b5e57e3`.
- Historial de Supabase: incluye `20261104024300` y no contiene `20261104040000`.
- `www.ownlevel.fit`, ruta `finish-with-feelings`: POST sin `Authorization` devuelve `401` con y sin negociación; OPTIONS devuelve `204`.

La autenticación corre antes de validar la query, así que esos `401` **no prueban la negociación ni el contenido del recibo**. **No se ejecutó un finish autenticado en producción.**

### QA física: pendiente

Checklist única en `docs/progress/367-insights-pr2-expand.md`: accesibilidad y claro/oscuro; omitir; responder y quitar; pre/post; reinicio/offline; corte al finalizar; conflictos; recibo con adiciones a rutina; exclusión entre dos pestañas de Safari. Los fallos técnicos automatizados no requieren videos.

## Límites

Sin migraciones, escrituras de prueba en producción, deploys, builds ni instalaciones de Diario. Sin #380, loader all-time, asociaciones, patrones, scores, rediseño de Progreso ni PR 4.

Mantener abierto, en borrador y sin auto-merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
