# OWNLEVEL · Plan de roadmap (propuesta 16/10)

Referencia de trabajo. Junta lo que falta de M9 (resumen de Notion › M9 › "Plan siguiente (16/10)") y las propuestas nuevas para completar el roadmap. Lo que se decida acá se pasa a Notion (base de Ideas y página de M9).

Estado de partida: M0–M8 cerrados. M9.0–M9.3 implementados y mergeados (PRs #176–#263). Falta QA físico, M9.4 Web y M9.5 Release.

---

## 0. Lo que falta de M9 (ya acordado)

### Lo de Nacho (destraba el resto)
- [ ] QA en iPhone de lo del 15–16/10:
  - Progreso, Entrada y splash.
  - Ajustes, Cuenta, Energía y Datos físicos.
  - Etapas, Tus etapas y métricas.
  - Eliminar cuenta: recorrer el flujo sin confirmar.
  - Texto grande y VoiceOver.
- [ ] QA físico pendiente de antes: haptics y Finalizar en iOS 26; deslizar en la biblioteca de Nutrición.
- [ ] Crear hola@ownlevel.fit y confirmar el nombre del responsable en las políticas.
- [ ] Apple Developer: activar Sign in with Apple en el App ID y crear la key para Supabase.
- [ ] Decidir:
  - entrar con mail por código de 6 dígitos (recomendado) o por enlace mágico;
  - bundle ID y nombre de producción.

### M9.5 Release
- [ ] Entrar con Apple (librería nativa + rebuild) y con mail.
- [ ] Identidad de producción:
  - variantes por `EXPO_PUBLIC_APP_ENV`;
  - nombre, bundle ID y scheme;
  - callback de Auth;
  - ícono final y versionado.
- [ ] Build de producción con EAS, TestFlight y App Privacy en App Store Connect.
- [ ] QA de release en iOS y regresión base en Android.

### Cierre técnico (sin depender de Nacho)
- [ ] Baseline de la raíz: 2 tests rotos (`daily-metrics/write-reliability`, `nutrition/pr73`) y 2 errores de lint heredados.
- [ ] CONTRACT: retirar la ruta vieja `/(tabs)/nutrition/reports`.
- [ ] Registrar en `IDENTIDAD.md` el fondo con resplandor y franjas, y la lista real de pestañas.
- [ ] Franjas de etapa en el gráfico de Nutrición de Progreso.

---

## 1. Producto: propuestas nuevas

### 1.1 Elegir qué usás (módulos personalizables) · antes del Release · P1
**Qué es:** el usuario elige qué partes usa:
- Entrenamiento
- Nutrición
- Cuerpo y métricas
- Suplementos

**Cómo funciona:**
- Lo que está apagado desaparece de las pestañas, de Inicio, de Progreso (incluido Explorar y Qué influye) y de Ajustes.
- Apagar no borra datos, solo los oculta. Volver a prender muestra todo como estaba.
- Se elige en la primera vez guiada (es la primera pregunta) y se cambia en Ajustes › App.
- Al menos un módulo tiene que quedar prendido.

**Backend (EXPAND):**
- Preferencia `modules` en el perfil.
- Lectura en el contrato de perfil y escritura con CAS, como el resto del perfil.
- Las builds instaladas que no la conocen ven todo, igual que hoy.

**Puntos a decidir:**
- Qué pasa con las pestañas si se apaga Entrenamiento (¿Inicio + Nutrición + Progreso?).
- Si "Cuerpo" se puede apagar separado de Nutrición. Hoy Energía depende de los datos físicos.

**Riesgos:**
- Progreso cruza dominios: si un módulo está apagado, sus medidas no se ofrecen. Los datos viejos siguen existiendo.
- No confundir "módulo apagado" con "sin datos" (empty ≠ unavailable ≠ oculto).

### 1.2 Suplementos · antes del Release · P1
**Qué es:** registrar los suplementos que tomás cada día. Es un módulo: si no lo usás, no existe.

**Tu lista:**
- Nombre (creatina, proteína, magnesio, vitamina D, propio).
- Dosis y unidad (g, mg, cápsulas, scoop, ml).
- Momento: mañana, antes de entrenar, después, noche o cualquiera.
- Qué días: todos, días de entrenamiento o días elegidos.
- Ordenar, archivar y ponerle ícono, igual que las métricas.

**Registro diario:**
- Tildar con un toque desde Inicio y desde el día. Se guarda la hora; se puede cambiar la dosis de ese día.
- Lo no tildado es "sin registrar", nunca "no tomé". Opción explícita "Hoy no" si se quiere marcar.
- Deshacer, como en métricas.

**Progreso:**
- Constancia en el calendario.
- Medida disponible en Explorar y en Qué influye (por ejemplo, creatina contra peso o 1RM estimado), sin afirmar causas.

**Más adelante:** recordatorios, cuando existan notificaciones.

**Tono:** sin culpa. Nada de "te olvidaste" ni de rachas rotas.

**Backend (EXPAND):**
- Tablas `supplements` (definiciones del usuario) y `supplement_logs` (día, hora, dosis), con RLS por dueño.
- RPC con idempotencia para tildar y destildar; CAS en las definiciones.
- Rutas de la Mobile API v1 para leer y escribir.
- Los logs guardan la dosis del momento, para que la historia no cambie si después editás el suplemento.

**Por qué no usar las métricas actuales:** solo guardan números (entero, decimal, duración). Un suplemento necesita sí/no, dosis, momento y días.

**Diseño:** bocetos en Pencil antes de implementar (fila en Inicio, lista en Ajustes, detalle del día, Progreso).

### 1.3 Exportar tus datos · post-release · P2
- Bajar todo en CSV o JSON desde Ajustes (App) y desde la Web.
- La política de privacidad ya promete el derecho de acceso (Ley 25.326).
- El archivo se genera en el servidor por usuario, sin `service_role` en el cliente y con límite de pedidos.

### 1.4 Actividad en vivo del entrenamiento (iOS) · post-release · P2
- Descanso y serie actual en la pantalla bloqueada y en la Dynamic Island.
- Requiere un target nativo (widget extension) y rebuild.

### 1.5 Apple Salud / Health Connect · post-release · P2
- Traer pasos, sueño y peso sin cargarlos a mano.
- Hay que definir la fuente y qué pasa si el dato ya estaba cargado (sin pisar lo manual).
- Quedó afuera de M9 a propósito.

### 1.6 Más adelante · P3
- **Fotos de progreso privadas:** datos sensibles. Requieren storage privado, URLs firmadas cortas y borrado incluido en "Eliminar cuenta".
- **Kilos o libras:** preferencia de visualización; se sigue guardando en kg.
- **Widget de Inicio** en la pantalla del iPhone.

### Ya registrado en Notion (para no duplicar)
- Primera vez guiada (B1–B5): se suma la pregunta de módulos.
- Passkeys.
- Sugerencias "Para vos".
- Editar y repetir comidas importadas.
- Carga rápida en Tu día.
- Training Evolution (TE1, TE2), Nutrition Foundation, notificaciones y biblioteca de ejercicios con media.

---

## 2. Seguridad

| # | Qué | Cuándo | Prioridad |
|---|---|---|---|
| S1 | Activar "leaked password protection" en Supabase y resolver los avisos del advisor | antes del Release | P0 |
| S2 | Revisión de RLS y ownership tabla por tabla (ninguna sin políticas; ninguna `security definer` expuesta sin wrapper invoker; grants de `anon`) | antes del Release | P0 |
| S3 | Auditoría de dependencias (`npm audit` en la raíz y en `apps/mobile`) | antes del Release | P1 |
| S4 | Backups: confirmar el plan de Supabase y probar una restauración | antes del Release | P1 |
| S5 | Límite de pedidos en la Mobile API, sobre todo escrituras y eliminar cuenta | antes del Release | P1 |
| S6 | Encabezados de seguridad en la Web: CSP, HSTS, `frame-ancestors`, `Referrer-Policy` | con M9.4 | P2 |
| S7 | Cerrar sesión en todos los dispositivos (Ajustes › Cuenta) | post-release | P2 |
| S8 | Observabilidad de errores sin datos privados (crash reporting en Mobile y Web) | post-release | P2 |

---

## 3. Web (M9.4: planificar y enseñar)

| # | Qué | Cuándo | Prioridad |
|---|---|---|---|
| W1 | Página pública de OWNLEVEL: qué es, capturas, link al App Store y URL de soporte. Apple pide URL de soporte y conviene una de marketing | antes del Release | P0 |
| W2 | Identidad champagne en toda la Web (chau violeta), con los tokens compartidos | post-release | P1 |
| W3 | Planificar en pantalla grande: rutinas, semana de entrenamiento y etapas del plan nutricional | post-release | P1 |
| W4 | Enseñar: guías cortas de cómo usar cada parte | post-release | P2 |
| W5 | Reportes para compartir o imprimir (nutricionista, entrenador) | post-release | P2 |
| W6 | Módulos y suplementos también en la Web (paridad de producto) | post-release | P2 |

---

## 4. Orden recomendado

1. **Ahora, en paralelo a tu QA:**
   - S1 y S2;
   - cierre técnico;
   - bocetos de módulos (1.1) y suplementos (1.2).
2. **Antes del Release:**
   - módulos y suplementos implementados (EXPAND → Mobile);
   - primera vez guiada con la pregunta de módulos;
   - S3, S4 y S5;
   - W1 página pública.
3. **Release (M9.5):** Apple, mail, identidad de producción, EAS, TestFlight y App Store.
4. **Después del Release:**
   - M9.4 Web (W2–W6, S6);
   - exportar datos;
   - Actividad en vivo;
   - Apple Salud;
   - Training Evolution;
   - Nutrition Foundation;
   - notificaciones (con recordatorios de suplementos);
   - S7 y S8;
   - el resto de 1.6.

## 5. Decisiones abiertas
- [ ] ¿Módulos y suplementos entran antes del Release o justo después?
- [ ] Pestañas cuando se apaga Entrenamiento.
- [ ] ¿Cuerpo se apaga separado de Nutrición?
- [ ] Suplementos: ¿"Hoy no" explícito o solo tildar?
- [ ] Entrar con mail: código o enlace.
- [ ] Bundle ID y nombre de producción.
