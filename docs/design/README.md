# Diseño de OWNLEVEL

> **Reemplazado en lo visual (octubre 2026).** Este documento es de la Web anterior a la marca: acento violeta, tamaños de Tailwind y radios propios. Para color, tipografía, radios, espacios, íconos, movimiento y tono, la referencia para Mobile y Web es [`docs/brand/ownlevel-marca/IDENTIDAD.md`](../brand/ownlevel-marca/IDENTIDAD.md) con los valores de `tema/tokens.ts`. Lo que sigue vale solo como contexto de la Web actual hasta su migración (M9.4) y para los principios no visuales (jerarquía, estados, invariantes).

Esta carpeta define el lenguaje de producto y de interfaz que guía los rediseños posteriores a PR22. Es una guía de decisiones prácticas; no es una librería UI paralela ni reemplaza al código, los tests o las invariantes de dominio.

## Documentos vigentes

- [Principios](./principles.md): dirección de producto, tokens y reglas de interacción.
- [Patrones](./patterns.md): cuándo usar las superficies, controles y estados que ya existen.
- [Auditoría visual](./visual-audit.md): inventario de rutas, clasificación y prioridad de rediseño.

## Cómo usarlo

Antes de diseñar una pantalla o un flujo, contrastar la propuesta con estos documentos y con el estado real de la aplicación. Si hay tensión, prevalecen las invariantes de datos y seguridad documentadas en `docs/architecture/`.

Home y Reportes son las referencias internas aprobadas: no son plantillas para copiar, sino ejemplos del nivel de claridad, densidad y jerarquía esperado.

## Alcance

PR23 documenta decisiones. No rediseña pantallas, no cambia navegación y no modifica modelos, APIs ni permisos. Los cambios visuales se implementan en PRs posteriores con alcance propio.

Próxima etapa: **PR27 — Arquitectura Train**.
