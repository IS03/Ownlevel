# M9.3 · Biblioteca de ejercicios — QA

Referencias: [marca](../brand/ownlevel-marca/IDENTIDAD.md), [decisión y compatibilidad](m9-brand-polish-plan.md). Repetir lo visual en claro/oscuro, Reducir movimiento y texto grande.

- Lista: título nativo Ejercicios, buscador, grupos fijos sin acordeones, chips múltiples y Todos. Buscar también por músculo e implemento. Puntos de rutinas y +N; fila sin vidrio.
- Filtros: cierre sin aplicar; Limpiar limpia la hoja y conserva los chips de grupo. Activos/Archivados/Todos, uso e implementos múltiples. Ver N coincide con el resultado real.
- Crear/editar: hoja con teclado, menús en la misma fila, nombre válido habilita ✓, X pregunta por cambios. Sin objetivos por defecto ni asignaciones. Notas/músculo opcionales y valores antiguos desconocidos conservados.
- Crear desde el editor de rutina: queda seleccionado. Al agregar, una sola serie sin reps/peso/RIR/descanso; mantener. Crear tampoco asigna una rutina directamente.
- Editar un ejercicio con valores sugeridos guardados en Web: cambiar solo nombre/notas desde Mobile; comprobar que Web conserva sus sugeridos y asociaciones. Si Web cambia el ejercicio mientras la hoja está abierta, Mobile recibe `EXERCISE_CHANGED`, recarga y conserva el borrador para cerrar/reabrir. No hay reintento automático.
- Ficha: notas y rutinas activas reales; abrir rutina e historial. Última vez: cargando/no disponible/vacío distintos, series registradas con modo histórico, ceros y faltantes distintos.
- Agregar a rutina: solo activas, Ya está bloqueado; una operación de plantilla con versión. Cambiar esa rutina en Web antes de confirmar: aviso de conflicto y nueva lectura, sin reintento automático.
- Archivar/restaurar sin confirmación ni rojo, aviso sobre pestañas y Deshacer (4 s). No quita el ejercicio de sus rutinas ni cambia sesiones anteriores.
- Sin conexión: datos confirmados y lectura vieja, sin vacío falso. Crear con respuesta no confirmada y reintentar sin cambiar campos: mismo intento, sin duplicados. Warning de nombre parecido visible.

- Iniciar una rutina desde Mobile: el nuevo ejercicio sigue con una serie vacía, incluso si tiene sugeridos antiguos de Web. El cero guardado sigue siendo cero. Cancelar/reintentar un inicio ambiguo conserva su clave y no duplica sesiones.
- Layout físico: filas alineadas a la izquierda y ancho constante; menú largo y corto conservan su fila; buscador nativo y contador coinciden con filtros; nombre largo completo en la ficha; notas visibles sobre el teclado; texto grande sin recortes.

La sesión en curso sigue precargando objetivos desde el servidor al agregar un ejercicio. Web sigue usando valores sugeridos y su inicio conserva el fallback. Catálogo externo e imágenes: no implementados.

## Orden de despliegue

1. EXPAND: migración `20261013211730_mobile_exercise_identity_template_start_expand.sql` aplicada en la base remota el 2026-10-13.
2. Desplegar la API aditiva (`update_identity`, `templateTargetsOnly`) y luego distribuir Mobile. No hace falta regenerar dependencias nativas.
3. OBSERVE: confirmar edición CAS, inicio vacío, replay y clientes anteriores. No borrar campos ni RPC anteriores.

Runner SQL: `OWNLEVEL_TEST_MODULES=/ruta/externa/node_modules node scripts/testing/m9-exercise-library.mjs`, con `embedded-postgres@17.10.0-beta.17` instalado fuera del repo. Prueba la migración real dos veces, ownership/permisos, CAS entre conexiones, defaults/asociaciones/historial, null/0, inicio Web anterior y ledger compartido.


## Evidencia local · 2026-10-13

- Mobile: `npm run validate`, 120 suites / 910 tests; typecheck, lint y config pasan.
- API Training: 57 tests pasan; typecheck raíz y lint de archivos modificados pasan.
- Suite raíz: 1514 tests pasan; permanecen los dos fallos preexistentes de `daily-metrics/write-reliability` y `nutrition/pr73` (archivos ajenos a este cambio).
- PostgreSQL 17 desechable: migración real reaplicada, tokens que avanzan dentro de una transacción, ownership/permisos, defaults/asociaciones/historial, null/0, fallback Web/legacy, replay y carreras entre conexiones (Web vs identidad, dos identidades, inicio concurrente).
- Export iOS/Android compilado. Lista actual verificada en Simulator en claro y oscuro: buscador nativo, ancho/alineación y superficies. Menús/teclado, VoiceOver, texto grande, Reducir movimiento y escrituras contra la API desplegada quedan para el QA físico de arriba.
