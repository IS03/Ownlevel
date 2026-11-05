# #367 — Migraciones aplicadas y rollout completado

Las dos migraciones fueron autorizadas y aplicadas el 2026-11-05. Los cinco PR están mergeados y sus despliegues en READY.

**Registro vigente:** [rollout de producción](367-rollout-produccion-2026-11-05.md).

| Migración | Versión efectiva | Blob SQL |
| --- | --- | --- |
| Procedencia horaria (#387) | 20261105210605 | 54e431df06a2090f69df049cc09cfc997342bc68 |
| Revisión transaccional (#391) | 20261105211040 | 25181ddd08295d1c143ba9771d739dcd9150f40e |

Los timestamps los asignó Supabase. Git y los fixtures se alinearon con ellos sin cambiar SQL ni modificar el historial de producción. No volver a aplicar las versiones anteriores del plan.

[Paquete previo archivado, con validación y límites](https://github.com/IS03/Ownlevel/blob/1fc1b23bf2869ec6b9f80d85faa3cb2fe04c02c9/docs/progress/367-autorizacion-migraciones.md).

Continúan OBSERVE, la actualización del esquema de ChatGPT y la [QA física diferida](367-qa-fisica.md). #367 sigue abierto y “consistente” deshabilitado.
