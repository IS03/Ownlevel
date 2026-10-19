<p align="center">
  <img src="./docs/brand/ownlevel-marca/logo/png/logo-horizontal-claro.png" alt="OWNLEVEL" width="340" />
</p>

<p align="center">
  <strong>Entrenamiento, nutrición, cuerpo y progreso en una sola experiencia.</strong>
</p>

<p align="center">
  PWA personal mobile-first para registrar lo que hacés, seguir cómo cambiás y entender qué hábitos parecen acompañar tu progreso.
</p>

<p align="center">
  <a href="https://ownlevel.fit">ownlevel.fit</a> ·
  <a href="./docs/ownlevel-architecture.md">Arquitectura</a> ·
  <a href="./docs/progress-v2.md">Progress V2</a> ·
  <a href="./docs/README.md">Documentación</a>
</p>

---

## Qué es OWNLEVEL

OWNLEVEL centraliza el seguimiento físico diario y transforma registros de entrenamiento, nutrición, métricas personales y cuerpo en historial y análisis comparables en el tiempo.

La aplicación está diseñada principalmente para iPhone/mobile y funciona como PWA, con una experiencia enfocada en registrar rápido durante el día y profundizar después cuando hace falta.

## Áreas principales

| Área | Qué permite hacer |
| --- | --- |
| **Entrenamiento** | Crear rutinas y ejercicios, entrenar con series, peso, repeticiones y RIR, controlar descansos y conservar el historial de cada sesión. |
| **Nutrición** | Registrar comidas, alimentos y cantidades, seguir calorías/macros y trabajar con objetivos y gasto energético del día. |
| **Métricas** | Configurar y registrar métricas personales diarias como pasos, agua, sueño u otras métricas personalizadas. |
| **Cuerpo** | Registrar peso y medidas corporales, conservar observaciones históricas y revisar su evolución. |
| **Historial** | Reconstruir qué ocurrió en una fecha concreta entre nutrición, entrenamiento, métricas y cuerpo. |
| **Progress** | Comparar períodos, analizar entrenamiento, nutrición, cuerpo y hábitos, y explorar relaciones entre variables registradas. |

### Progress V2

Progress es la capa analítica de OWNLEVEL. Parte de los datos reales registrados por cada dominio y permite responder tres preguntas:

1. **¿Estoy mejorando?**
2. **¿Dónde estoy mejorando?**
3. **¿Qué parece relacionado con esa mejora?**

Incluye análisis por períodos, comparaciones A/B, entrenamiento general y por rutina/músculo/ejercicio, nutrición, cuerpo, actividad y hábitos, además de **Relationships** para explorar asociaciones observacionales entre variables sin tratarlas como causalidad.

La arquitectura y semántica completa están documentadas en [`docs/progress-v2.md`](./docs/progress-v2.md).

## Stack

| Capa | Tecnología |
| --- | --- |
| Framework | Next.js 16 · App Router |
| Frontend | React 19 · TypeScript · Tailwind CSS 4 |
| UI | Base UI / shadcn · Lucide |
| Backend | Supabase Postgres · Auth · RLS |
| Deploy | Vercel |
| PWA | `@ducanh2912/next-pwa` |
| Tests | Vitest |

## Estructura

```text
src/
├── app/          rutas, layouts y pantallas
├── components/   componentes y UI compartida
└── lib/          dominio, datos, analytics y utilidades

supabase/
└── migrations/   esquema y evolución de la base de datos

docs/             documentación técnica y de producto
public/           assets e identidad visual
```

## Desarrollo local

**Requisitos:** Node.js 20+ y un proyecto Supabase con Auth habilitado.

```bash
git clone https://github.com/IS03/gym.git
cd gym
npm install
cp .env.example .env.local
npm run dev
```

La aplicación queda disponible en `http://localhost:3000`.

Variables públicas mínimas:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

La `service_role` nunca debe exponerse en frontend.

### Scripts

```bash
npm run dev      # desarrollo
npm run test     # Vitest
npm run lint     # ESLint
npm run build    # build de producción
npm run start    # servidor de producción
```

## Documentación

La puerta de entrada a toda la documentación es [`docs/README.md`](./docs/README.md).

| Documento | Fuente de verdad para |
| --- | --- |
| [`docs/ownlevel-architecture.md`](./docs/ownlevel-architecture.md) | Arquitectura general de OWNLEVEL, dominios, rutas, auth, datos y extensibilidad. |
| [`docs/architecture/data-model.md`](./docs/architecture/data-model.md) | Modelo de datos canónico, ownership, relaciones, snapshots, lifecycle y reglas de schema. |
| [`docs/architecture/history-calendar.md`](./docs/architecture/history-calendar.md) | Historial diario, Calendario, reconstrucción factual por fecha y navegación histórica. |
| [`docs/progress-v2.md`](./docs/progress-v2.md) | Analytics, períodos, coverage, Comparisons, Relationships y contratos de Progress. |
| [`docs/architecture/training-system.md`](./docs/architecture/training-system.md) | Lógica operativa vigente de Entrenamiento. |
| [`docs/architecture/nutrition-system.md`](./docs/architecture/nutrition-system.md) | Lógica operativa vigente de Nutrición, Plan V2, gasto, comidas y snapshots. |
| [`docs/architecture/auth-security.md`](./docs/architecture/auth-security.md) | Google OAuth, sesión, RLS, ownership, secretos e integraciones privadas. |
| [`docs/brand/ownlevel-marca/IDENTIDAD.md`](./docs/brand/ownlevel-marca/IDENTIDAD.md) | Identidad de marca vigente (Mobile y Web): colores, tipografía, radios, espacios, íconos, movimiento y tono. |
| [`docs/design/principles.md`](./docs/design/principles.md) | Principios de la Web anterior a la marca; reemplazados en lo visual por la identidad. |
| [`docs/integrations/chatgpt-nutrition.md`](./docs/integrations/chatgpt-nutrition.md) | Integración privada entre ChatGPT y el registro nutricional. |

Ante contradicciones, el código y los tests actuales tienen prioridad sobre documentación histórica. Los documentos de `docs/archive/` se conservan sólo como contexto.

## Principios del proyecto

- **Mobile-first:** la experiencia principal se diseña para uso real desde el teléfono.
- **Una fuente de verdad:** historial y analytics derivan de datos canónicos, evitando sistemas paralelos.
- **Historia preservada:** los cambios actuales no deben reescribir silenciosamente lo que ocurrió en el pasado.
- **Datos antes que conclusiones:** ausencia de registro no equivale automáticamente a cero y Progress evita fabricar conclusiones con evidencia insuficiente.
- **Profundidad progresiva:** registrar debe ser rápido; analizar puede ser detallado cuando el usuario decide profundizar.

---

<p align="center">
  <strong>OWNLEVEL</strong><br />
  Registrar · Comparar · Entender · Progresar
</p>
