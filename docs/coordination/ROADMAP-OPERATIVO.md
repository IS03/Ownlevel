# OWNLEVEL — Coordinación operativa y roadmap vivo

> **Corte inicial: 2026-11-09, Córdoba (Argentina).** Este documento es una guía operativa versionada, NO una prueba de que una tarea quedó ejecutada. Revalidar GitHub y el dispositivo antes de tomar decisiones. No modificar producción por el mero hecho de leer este plan.
>
> **Tablero ejecutivo canónico:** [Notion — OWNLEVEL Product Roadmap · Web + Mobile](https://app.notion.com/p/3dba0fc666a481a0bf7fc3320ecdb634). **Ejecución técnica:** [GitHub Issues](https://github.com/IS03/Ownlevel/issues) y [PRs](https://github.com/IS03/Ownlevel/pulls). **Prompts de arranque:** [PROMPTS-DE-CHATS.md](PROMPTS-DE-CHATS.md).
>
> Este archivo complementa [AGENTS.md](../../AGENTS.md), no modifica su arquitectura, convenciones, ni reglas de seguridad.

## 1. Regla de coordinación: una sola fuente por tipo de verdad

- **GitHub `main`**: implementación integrada; **PR**: cambios propuestos; **issue**: alcance y criterios pendientes; **worktree local**: posible trabajo no publicado que NO es visible desde conectores remotos.
- **Notion Roadmap principal**: visión ejecutiva, prioridades, dependencias, decisiones y bloqueos. No convertir un snapshot antiguo en estado actual sin comprobar las fuentes.
- **Este documento**: procedimiento compartido entre chats/agentes y contexto compacto para reinicios. Actualizar cuando cambien la estrategia, los límites o la secuencia, no después de cada mensaje.
- **El chat**: intercambio temporal; no único depósito de estados ni acuerdos.
- **No automatizar cierres**: "programado" ≠ "PR creado" ≠ "mergeado" ≠ "Web READY" ≠ "binario iOS instalado" ≠ "probado físicamente".

## 2. Estado verificado al 09/11/2026

- `main`: `0b4a256ccec0d3b05484f9b63854ac86d9778dbb`.
- **Issues abiertos**: [#334](https://github.com/IS03/Ownlevel/issues/334), [#367](https://github.com/IS03/Ownlevel/issues/367), [#402](https://github.com/IS03/Ownlevel/issues/402), [#432](https://github.com/IS03/Ownlevel/issues/432). Los issues secundarios históricos pueden estar cerrados; consultar su estado antes de reabrir.
- **Único PR abierto**: [#441](https://github.com/IS03/Ownlevel/pull/441), DRAFT experimental asociado a #367. Sin campaña reservada ejecutada; no habilitado para fusionar o publicar inferencias.
- **#402**: [#448](https://github.com/IS03/Ownlevel/pull/448) integró la primera portada de Progreso (Entrenamiento/Cuerpo/Nutrición, cobertura y accesos). **Encargo vigente a Codex:** “#402 / HALLAZGOS CLAROS EN LA PORTADA: integrar la primera portada y completar su lectura rápida con unos pocos hallazgos defendibles, reutilizando resultados existentes”. No hay PR nuevo publicado para ese encargo. **DESCONOCIDO**: cambios locales de Codex aún sin push. Después: navegación y gráficos profundos hasta registros fuente.
- **Checkpoint posterior de #402 — entrega recuperada:** [PR #453](https://github.com/IS03/Ownlevel/pull/453), DRAFT, rama `codex/402-progress-findings`, candidato de producto `3965e3f` sobre `70d355b`. Hasta tres hallazgos canónicos con referencia/cobertura; 213 suites / 1.802 pruebas, tipos/lint/configuración/guarda y export iOS aprobados. Próximo paso único: revisar este incremento e integrarlo solo con autorización; gráficos profundos después. Sin QA física acreditada ni cambios en #441. Este checkpoint actualiza el estado local/publicado que figuraba desconocido en el corte inicial.
- **Checkpoint posterior — gráficos de Entrenamiento #402:** #453 integrado en `2576287`; el frente de código pasa a `codex/402-training-chart-inspection`, desde ese main. Incremento acotado: inspección de punto → sesión/series originales → retorno contextual. Build/instalación sigue en el chat iOS/QA; este worktree no las ejecuta. El corte histórico de arriba se conserva.
- **Claude (trabajo publicado)**: [#450](https://github.com/IS03/Ownlevel/pull/450) sensaciones y [#447](https://github.com/IS03/Ownlevel/pull/447) Liquid Glass Nutrición ya fusionados, no pendientes de merge. No hay prueba de que Claude no conserve trabajo local: inspeccionarlo antes de asignar otra tarea.
- **#367**: comparadores, contexto de comidas/métricas, sensaciones, semanas y coincidencias descriptivas ya incorporados. La campaña secuencial de 9.000 historiales **no acreditó** el umbral de falsas alertas propuesto; no publicar causalidad, descubrimiento inferencial o “consistente” bajo #441 sin nuevo gate.
- **#334**: bucle `ROUTINE_LIST_CHANGED` mitigado tras [#335](https://github.com/IS03/Ownlevel/pull/335); Supabase `gym` `ACTIVE_HEALTHY`, migraciones aplicadas y sin indicios recientes de la tormenta de rollbacks. Pendiente: métricas actuales de memoria/Disk I/O/consumo. Advisors advierten RLS `progress_views` de costo mejorable, una FK sin índice y varios índices sin uso; no aplicar cambios sin caso medido. 23 RPCs `SECURITY DEFINER` autenticadas requieren revisión de ownership si se aborda seguridad; el patrón por sí solo no demuestra vulnerabilidad.
- **Vercel**: último despliegue Web correspondiente a `main` `0b4a256` estaba `READY`; NO equivale a build de iOS. No se pudo obtener consumo medido de Fluid Active CPU ni costos recientes.
- **#432**: índice de QA iPhone; la verificación física es **opcional para merges/cierres de implementación**, salvo decisión expresa. No afirmar que una build fue instalada o probada sin evidencia.

## 3. Orden de prioridades y dependencias

| Secuencia | Iniciativa | Propietario operativo | Estado/condición de cierre |
| --- | --- | --- | --- |
| **AHORA A, paralelo** | Build de **OWNLEVEL Diario** y captura de observaciones (#432) | Usuario + chat iOS/QA | Commit exacto, identidad, firma, instalación, login y observaciones; sin desinstalar ni sobrescribir otra variante. |
| **AHORA B, único frente de código** | **#402 — Hallazgos claros en portada** | Codex **o** Claude, no ambos sobre la misma tarea | Reusar lectura canónica; 1–3 hallazgos, explicación, cobertura y acceso; pruebas. |
| **PARALELO DE LECTURA** | **#334 — Seguimiento infraestructura** | Chat investigación | Obtener datos reales de memoria/I/O/CPU o declarar bloqueo de métricas; no cambios productivos por defecto. |
| **SIGUIENTE DESARROLLO** | **#402 — Gráficos y recorrido profundo** | Único agente de código | Punto → valor/fecha → fuente → retorno preservado; no duplicar lo ya resuelto. |
| **DESPUÉS** | Correcciones QA confirmadas P0/P1 y lote de P2 | Único agente de código | Reproducción, prueba de regresión, merge. **P0 interrumpe**. |
| **POSTERIOR** | **#367 — calidad/cobertura y propuesta de Insights** | Investigación + propietario elegido | Separar descripción de inferencia; estado temporal de macros/comidas/sueño/pasos explícito. |
| **BLOQUEADO / INVESTIGACIÓN** | **#441 — contraste predictivo experimental** | Revisión metodológica | No fusionar ni activar sin protocolo/costo y validación autorizados. |
| **LATER PRODUCTO** | Suplementos, galería, notificaciones, módulos, release público | Roadmap V2 Notion | No arrancar por inercia; decidir alcance aparte. |

**WIP limit**: solo **un agente de escritura sobre código/producto**, un frente activo de implementación. Investigación y QA son paralelos **sin tocar los mismos archivos ni producción**. Si surge un problema P0 (seguridad o pérdida de datos), suspender la prioridad en curso hasta resolver o contener.

## 4. Cuatro chats y un ejecutor

**Títulos exactos para las conversaciones del proyecto ChatGPT OWNLEVEL** (establecer manualmente si el título automático no coincide):

| Chat | Título exacto | Qué enviar |
| --- | --- | --- |
| 01, este chat | **OWNLEVEL \| 01 — Dirección y Roadmap** | Decisiones, prioridades, checkpoints de otros chats y revisión de PRs. |
| 02, nuevo | **OWNLEVEL \| 02 — Build iOS y QA** | **Todas** las capturas y observaciones de la app real: errores funcionales, visuales, cosas incómodas o que no gustan. Es la bandeja inicial única de QA. |
| 03, nuevo | **OWNLEVEL \| 03 — Producto y UX/UI** | Ideas nuevas, referencias de otras apps y rediseños importantes; no repetir el reporte de bug del chat 02. |
| 04, nuevo | **OWNLEVEL \| 04 — Investigación Técnica e Insights** | Supabase, Vercel, arquitectura, seguridad y validez analítica; lectura por defecto. |

El usuario no tiene que decidir si una captura es "bug" o "diseño": **la envía primero al chat 02**, donde se identifica; si requiere diseño de producto, se traslada mediante una ficha resumida al chat 03. Para Codex/Claude no se abre un nuevo chat por cada issue: continuar la sesión de código que tiene el trabajo activo, preservando estado local.



1. **Dirección y Roadmap** (chat actual): priorizar, conciliar Notion/GitHub, revisar PRs, tomar decisiones, actualizar documentos. Evitar logs masivos o depuraciones línea a línea.
2. **Build iOS y QA / bandeja de hallazgos** (chat nuevo): preparar/instalar Diario, realizar recorridos en iPhone, recibir capturas, clasificar errores vs gustos, deduplicar y proponer issues. **Por defecto no programa ni toca código**.
3. **Producto y UX/UI** (chat nuevo): investigar soluciones, comparar alternativas, especificar mejoras con escenarios/criterios visuales y semánticos, sin adjudicárselas al agente de código hasta que Dirección las priorice. No ejecutar cambios por defecto.
4. **Investigación técnica e Insights** (chat nuevo): Supabase/Vercel de solo lectura, datos/metodología de #367/#441, auditoría de seguridad y rendimiento con pruebas; riesgos y recomendaciones verificables. No desplegar ni aplicar migraciones por defecto.

**Ejecución**: Codex *o* Claude Code, escogido por disponibilidad y continuidad de worktree. Antes de actuar: `git status -sb`, ramas/worktrees, diff local sin guardar, `main` actual, issues/PRs abiertos y guía [AGENTS.md](../../AGENTS.md). No auto-stash, no `git reset --hard`, no force push, no eliminar builds ni reinstalar apps. Ningún chat indica iniciar #402 de nuevo sin inspeccionar el trabajo local.

## 5. Procedimiento específico: OWNLEVEL Diario en iPhone

Guía canónica existente: [docs/mobile/ios-daily-release.md](../mobile/ios-daily-release.md). **Seguirla por encima de recetas generales.** Expo definitivo vive en `apps/mobile/`; `ios/` de raíz es Capacitor legacy y NO es el objetivo.

- Variante **Development**: `fit.ownlevel.app.dev`, scheme `ownlevel-dev`, requiere Metro.
- Variante **Diario Release**: `fit.ownlevel.app.daily`, callback `ownlevel-daily://auth/callback`, binario con `main.jsbundle` embebido, funciona sin Metro.
- Última preparación documentada: compilación **sin firma** exitosa, pero instalación real bloqueada por **Xcode “No Accounts” / perfil de Personal Team faltante** y teléfono no conectado. El callback de Diario constaba agregado en Supabase. No afirmar que la cuenta de Xcode o la conexión ya están corregidas.
- Antes de cambiar ramas: revisar cambios locales; antes de instalar: confirmar bundle ID, perfil válido, UDID, conservación de datos locales y variante existente. **No desinstalar Diario.**
- Comandos oficiales, **solo después de validar los prerrequisitos en la Mac**: `cd apps/mobile`; `npm run ios:daily -- prepare`; `xcrun devicectl list devices`; `npm run ios:daily -- build --device TU_UDID`; `npm run ios:daily -- verify --device TU_UDID`; `npm run ios:daily -- install --device TU_UDID`. La guía puede cambiar: leerla en `main` antes de ejecutar.
- Registrar el SHA del código del binario probado (el commit Web READY no es prueba de lo instalado), fecha, dispositivo, entorno, qué pasó y evidencia visual. Para QA: sesiones, finalización, Nutrición/Glass, Cuerpo, Progreso/Insights, regresiones #432. Reducir duplicaciones.

## 6. Bandeja única de QA y prioridades

**Mientras se prueban pantallas** usar el chat iOS/QA como bandeja temporal. Registrar por hallazgo:

`QA-ID | fecha | build SHA / variante | pantalla y camino | tipo (bug, UX, idea, pregunta) | severidad P0/P1/P2/P3 | pasos para reproducir | actual | esperado | evidencia | frecuencia | issue/PR relacionado | estado`.

- P0: pérdida/corrupción de datos, fuga de datos o imposibilidad crítica de guardar; escalar inmediatamente.
- P1: falla funcional importante o recurrente.
- P2: defecto visual/interacción molesto; agrupar por pantalla y causa.
- P3: preferencia estética/idea; no confundir con bug.
- **Confirmado/reproducible → GitHub issue** (no duplicar existente). **Idea no decidida → Notion Ideas Inbox**. **Checklist agrupada física → #432**, no agregar allí cada bug individual.
- Estados: `observado` → `reproducido / descartado / necesita evidencia` → `priorizado` → `en desarrollo` → `PR` → `mergeado` → `instalado` → `QA verificada / pendiente`.
- En un mismo reporte no confundir resultado de test sintético, QA simulator, QA iPhone y despliegue Web.

## 7. Cadencia operativa sugerida

- **Inicio de cada sesión de desarrollo** (5–10 min): Dirección confirma issue, WIP y rama; el agente revisa estado local y retoma, no reinicia.
- **QA**: bloques cortos de 20–30 minutos por módulo después de instalar una build; registrar sin pedir código en cada captura.
- **Triage**: al final de una sesión o tras un conjunto útil de observaciones, deduplicar y priorizar; P0 inmediato; P1 antes de más features si lo exige el uso; P2 en lotes.
- **Cierre de cada PR**: actualizar issue correspondiente y una línea del roadmap **solo si cambió prioridad o etapa**. Para trabajo activo, registrar `branch/PR/main SHA` y próximo paso.
- **Revisión semanal** (~30 min, solo recomendada): GitHub, estado de build iOS, bugs confirmados, bloqueos y decisión de siguiente tarea. No generar obligaciones automáticas ni fechas artificiales.
- **Al cambiar de chat/agente**: proporcionar los enlaces de Notion + este documento + AGENTS + issue actual, con un resumen de máximo 10 líneas, y exigir lectura del estado vigente. No reenviar todo el historial de chats.

## 8. Criterio de salida por tarea

Para decir **implementado**, exigir PR/commit y pruebas aplicables. Para decir **en main**, confirmar merge SHA. Para decir **producción Web**, confirmar deployment exacto. Para decir **iOS construido**, tener artefacto verificable con SHA y variante; para decir **iOS instalado**, evidencia real de instalación; para decir **validado físicamente**, pasos y resultado en dispositivo. La QA física **no bloquea por defecto** un PR ya aprobado, pero su ausencia se conserva como pendiente y nunca se presenta como éxito.

## 9. Mantenimiento y autoridad

- El **roadmap ejecutivo se mantiene en Notion**, y este archivo comparte el protocolo estable con agentes que trabajan desde GitHub.
- **No duplicar el issue** completo en Notion o en este documento. Mantener links, etapa, dependencia y síntesis.
- Si cambia la prioridad, actualizar **Notion**; si cambia el alcance/estado técnico, actualizar **issue/PR**; si cambia el protocolo de colaboración, actualizar **este Markdown / AGENTS** con revisión.
- Este snapshot queda fechado. El SHA `0b4a256` es la base del 09/11, **no una orden permanente para revertir commits posteriores**.
