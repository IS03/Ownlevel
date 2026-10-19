# Documentación de OWNLEVEL

Este directorio concentra la documentación funcional y técnica del proyecto.

## Fuente de verdad

Cuando dos documentos contradigan el estado actual, usar este orden:

1. código y tests del repositorio;
2. migraciones y esquema vigente de Supabase;
3. documentación de arquitectura vigente;
4. documentación de producto;
5. historial de decisiones;
6. archivos de `archive/`.

## Producto

### [`product/product-overview.md`](./product/product-overview.md)

Define el propósito de OWNLEVEL, áreas funcionales, principios de UX y alcance actual.

## Diseño / Product UX

### [`brand/ownlevel-marca/IDENTIDAD.md`](./brand/ownlevel-marca/IDENTIDAD.md)

Identidad de marca vigente para Mobile y Web: colores, tipografía, radios, espacios,
íconos, movimiento, vibración y tono. Los valores están en `tema/tokens.ts`.

### [`design/README.md`](./design/README.md)

Design System v1 de la Web anterior a la marca (acento violeta, tamaños de Tailwind).
**Reemplazado en lo visual por la identidad de marca;** se conserva como contexto de la
Web actual hasta su migración (M9.4).

- [`design/principles.md`](./design/principles.md): dirección, tokens y reglas de interacción.
- [`design/patterns.md`](./design/patterns.md): superficies, controles y estados.
- [`design/visual-audit.md`](./design/visual-audit.md): inventario de rutas y roadmap visual.

## Arquitectura

### [`ownlevel-architecture.md`](./ownlevel-architecture.md)

Documento canónico general y puerta de entrada técnica: producto, stack, app
shell, rutas, auth, fuentes canónicas, dominios, data access, extensibilidad y
mapa de documentación.

### [`progress-v2.md`](./progress-v2.md)

Documento canónico de Progress V2: fuentes de datos, catálogo de métricas,
períodos, coverage, Comparaciones, dominios, Relaciones, Home, extensibilidad y
antipatrones semánticos.

### [`architecture/data-model.md`](./architecture/data-model.md)

Referencia canónica del modelo de datos: clases de entidades, ownership, fuentes
de verdad, relaciones, snapshots, lifecycle, fechas, missing vs zero, legacy y
reglas para extender el schema sin romper historia.

### [`architecture/data-flow.md`](./architecture/data-flow.md)

Documento complementario sobre sincronización de peso, snapshots nutricionales,
flujo de entrenamiento, fechas e invariantes entre estado actual e historial.

### [`architecture/history-calendar.md`](./architecture/history-calendar.md)

Referencia canónica de Historial diario y Calendario: reconstrucción factual por
fecha, señales de presencia, navegación, edición histórica, fechas de Córdoba y
límite con Progress V2.

### [`architecture/training-system.md`](./architecture/training-system.md)

Referencia canónica de la lógica operativa de Entrenamiento: biblioteca, rutinas,
sesión activa, series, snapshots, autosave, progresión, finalización, historial y
corrección.

### [`architecture/nutrition-system.md`](./architecture/nutrition-system.md)

Referencia canónica de la lógica operativa de Nutrición: día nutricional,
comidas, Foods, comidas habituales, Plan V2, gasto energético, snapshots,
overrides, historial, importación e integración externa.

### [`architecture/auth-security.md`](./architecture/auth-security.md)

Referencia canónica de autenticación y seguridad: Google OAuth, sesión, proxy,
clientes Supabase, RLS, ownership, service role, credenciales de integración,
headers, PWA privada y reglas para extender límites de confianza.

## Desarrollo

### [`development/engineering-guidelines.md`](./development/engineering-guidelines.md)

Convenciones de ingeniería, validación, Next.js, Supabase, responsive y criterios para cambios seguros.

## Integraciones

### [`integrations/chatgpt-nutrition.md`](./integrations/chatgpt-nutrition.md)

Configuración y diagnóstico de la integración privada write-only entre ChatGPT
y las comidas canónicas de OWNLEVEL.

## Historial

### [`history/technical-decisions.md`](./history/technical-decisions.md)

Resumen de las decisiones que surgieron de los issues cerrados y de cómo fueron evolucionando.

La especificación raíz [`MIGRAR_HISTÓRICOS_E_IMPLEMENTAR_INFONUTRI.md`](./MIGRAR_HISTÓRICOS_E_IMPLEMENTAR_INFONUTRI.md) conserva el contexto de la migración inicial de nutrición y no reemplaza a `architecture/nutrition-system.md` como contrato vigente.

## Archivo

`archive/` conserva documentación histórica que puede ser útil para reconstruir contexto, pero que contiene decisiones antiguas o reemplazadas.

- `archive/initial-product-spec.md`: especificación inicial del producto.
- `archive/issue-history-full.md`: recopilación extensa de issues cerrados.

No implementar directamente desde un archivo de `archive/` sin verificar primero el código actual.
