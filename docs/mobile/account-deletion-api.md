# Eliminar cuenta · EXPAND / paso 6

Cumple App Store 5.1.1(v). Pantalla AJ7 del [plan de Ajustes](../../bocetos/ajustes/PLAN.md). Migración `20261016181514_account_deletion_expand.sql`, aplicada a producción (Supabase "gym") el 2026-10-16.

## API

`DELETE /api/mobile/v1/account` con body exacto `{ "confirmation": "ELIMINAR" }`. La identidad sale solo del Bearer. No hay service role: la ruta llama al RPC `mobile_delete_account` (wrapper `security invoker`) y este a `ownlevel_private.delete_account`, que usa `auth.uid()`.

- 200 `{ status: "deleted" }`. 400 confirmación faltante o distinta. 401 sin sesión válida. 503 resultado no confirmado.
- Es idempotente: si la cuenta ya no existe, responde `deleted` sin hacer nada. Si el token ya fue rechazado porque el usuario no existe, la app lo trata como eliminada solo cuando ya hubo un intento anterior incierto.

## Borrado

Una sola transacción borra todas las filas del usuario en orden de dependencias y después el usuario de Auth. Las sesiones e identidades de Auth, el perfil, los recibos, los tokens y las vistas se van en cascada. El orden explícito hace falta porque varias tablas se protegen con `ON DELETE RESTRICT` (los días apuntan a sus períodos; los valores, a sus métricas). Además, el trigger que impide borrar métricas del sistema tiene una excepción solo para el dueño, y solo durante esta transacción (`ownlevel.deleting_account`). Toma los mismos locks que el resto de las escrituras (412 → 413).

Se probó en producción con la cuenta real dentro de un bloque que fuerza rollback: borró todo en unos 1 s y no quedó nada modificado.

Borra también lo que se ve en la Web, porque es la misma cuenta. La Web todavía no tiene su propio botón para eliminar la cuenta.
