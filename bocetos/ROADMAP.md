# OWNLEVEL · Plan de roadmap (propuesta 16/10 · conciliación 21/10/2026)

Referencia de trabajo. Sincronizado con Notion › M9 › "Roadmap actualizado (21/10)" y la base de Ideas. Las propuestas con decisiones abiertas no pasan a ser requisitos de release por estar enumeradas acá. Detalle de pantallas: `bocetos/PENDIENTES.md`.

Estado: M0–M8 cerrados. Implementación y polish Mobile mergeados hasta **#301**, incluida la revisión de Progreso/Cuerpo del 21/10. M9 sigue en curso: QA físico de lo último, distribución pública y Web no están cerrados. No se modifica código ni se ejecuta una Release en esta conciliación.

---

## 0. Lo que falta de M9 (ya acordado)

### 0.1 Uso personal: OWNLEVEL Diario sin Metro

Este paso es distinto de publicar en TestFlight/App Store y no espera módulos, suplementos ni el rediseño Web.

- [x] Variante iOS separada (#300): `EXPO_PUBLIC_IOS_VARIANT=daily`, nombre OWNLEVEL Diario, bundle ID `fit.ownlevel.app.daily`, callback y Keychain propios. Dev y Capacitor conservan sus identidades.
- [x] Build Release arm64 sin firma y bundle embebido verificados; callback Diario agregado según confirmación del usuario.
- [x] Recuperar cuenta Apple/Personal Team y renovar Development Debug en iPhone; Dev y Simulator funcionan con Metro. Este perfil **no** firma automáticamente el bundle ID Diario.
- [ ] Recompilar **Diario con el código actualizado**, firmar e instalar sin reemplazar Dev.
- [ ] QA sin Mac/Metro: login Google, callback, restore/refresh, lecturas reales, red caída y recuperación; comprobar que Dev sigue funcionando.
- [ ] Confirmar expiración del perfil Diario y renovar sobre la misma app, sin desinstalar. La cuenta gratuita requiere renovación periódica también para Development.

Guía operativa: `docs/mobile/ios-daily-release.md`. La prueba personal no cierra los gates de distribución pública de abajo.

### QA físico y decisiones para distribución pública
- [ ] Repetir en iPhone los cambios recientes (#284–#301):
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

### M9.5 · Distribución pública (pendiente)
- [ ] Entrar con Apple (librería nativa + rebuild) y con mail.
- [ ] Identidad de producción:
  - entorno público (`EXPO_PUBLIC_APP_ENV`) y variante final; Diario usa `EXPO_PUBLIC_IOS_VARIANT` y no define por sí solo la identidad de App Store;
  - nombre, bundle ID y scheme;
  - callback de Auth;
  - versionado y gates de assets de tienda; los íconos de marca ya están instalados, el archivo de Icon Composer sigue diferido en el plan M9.
- [ ] Build de producción con EAS, TestFlight y App Privacy en App Store Connect.
- [ ] QA de release en iOS y regresión base en Android.

### Cierre técnico (sin depender de Nacho)
- [ ] Baseline de raíz: el 21/10 se reprodujeron los fallos de `daily-metrics/write-reliability` y `nutrition/pr73` (2 tests fallan / 6 pasan en esas dos suites). Son aserciones heredadas sobre migración/writer; no se corrigen en esta revisión documental. Lint global pendiente de revalidar, sin afirmar un conteo actual.
- [ ] CONTRACT: retirar la ruta vieja `/(tabs)/nutrition/reports`.
- [ ] CONTRACT diferido de Cuerpo: `ProgressHub` y ruta anterior, después de migrar/conservar la lectura de día desde Historial y los demás enlaces.
- [x] Pestañas reales, excepción Tu día y estilo editorial registrados en `IDENTIDAD.md`.
- [ ] Completar la decisión de atmósfera global/franjas de §9c; el resplandor editorial ya está mencionado, no toda la decisión global.
- [ ] Franjas de etapa en el gráfico de Nutrición de Progreso.

### Producto pendiente registrado (no bloquea instalar Diario)
- [ ] Primera vez guiada B1–B5. #295 retiró avisos del editor para llevarlos allí; no implementó el onboarding.
- [ ] EXPAND de Qué influye para fuerza, peso y energía al terminar; luego links hacia la pregunta real.
- [ ] Decidir si el aviso automático usará Lo que se movió junto (hoy no lo hace).
- [ ] Decidir carga rápida de métricas en Tu día, retorno de Para vos y edición/repetición de comidas externas conservando origen; aviso de duplicado rápido es opcional.
- [x] Íconos y porción configurable de métricas, carga rápida en Inicio (#258/#297), análisis por ejercicio y tendencias de métricas/nutrición: ya implementados.

---

## 1. Producto: propuestas nuevas

### 1.1 Elegir qué usás (módulos personalizables) · momento por decidir · P1
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

### 1.2 Suplementos · momento por decidir · P1
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
2. **Antes de la distribución pública:**
   - solo si se aprueba incluirlos antes: módulos y suplementos (EXPAND → Mobile), y primera vez guiada con la pregunta de módulos;
   - S3, S4 y S5;
   - W1 página pública.
3. **Distribución pública (M9.5):** Apple, mail, identidad de producción, EAS, TestFlight y App Store. La Release local Diario del §0.1 es una prueba personal anterior e independiente de estas decisiones.
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
