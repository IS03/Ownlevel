import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { progressRequestKey } from '@/api/progress';
import {
  PROGRESS_VIEWS_MAX, deleteProgressView, fetchProgressViews, renameProgressView, reorderProgressViews, viewIntentKey, type ProgressViewsRead,
} from '@/api/progress-views';
import { AppIcon, AppText, Button, InlineNotice, InlineUnavailable, ScrollScreen, SkeletonBlock, TextField, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { NativeDragHandle, NativeReorderItem, NativeReorderList } from '@/training/session-native-interactions';
import { BREAKDOWN_LABELS, DAYS_LABELS } from './explore-model';
import { ExploreSheet } from './explore-sheets';
import { useProgressRange } from './progress-range-context';
import { useProgressResource } from './use-progress-resource';

type ViewRow = ProgressViewsRead['views'][number];
const CHANGED = 'Tus vistas cambiaron en otro dispositivo. Ya ves las últimas.';

function detail(v: ViewRow): string {
  const label = v.result.status === 'ok' ? v.result.data.measure.label : 'Medida no disponible';
  const d = v.definition;
  return `${label}${d.breakdown ? ` · por ${BREAKDOWN_LABELS[d.breakdown].toLocaleLowerCase('es-AR')}` : ''}${d.days ? ` · ${DAYS_LABELS[d.days].toLocaleLowerCase('es-AR')}` : ''}${d.series ? ' · en el tiempo' : ''}`;
}

function RenameSheet({ view, onDone, onClose }: { view: ViewRow; onDone: (notice: string | null) => void; onClose: () => void }) {
  const { client } = useMobileApi();
  const [name, setName] = useState(view.name), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const save = async () => {
    const trimmed = name.trim();
    if (!client || busy || !trimmed) return;
    if (trimmed === view.name) { onClose(); return; }
    setBusy(true);
    const result = await renameProgressView(client, view.id, { name: trimmed.slice(0, 60), expectedVersion: view.version });
    setBusy(false);
    if (result.status === 'ok') { onDone(null); onClose(); return; }
    if (result.status === 'conflict' || result.status === 'not_found') { onDone(CHANGED); onClose(); return; }
    setError(result.status === 'validation' ? result.message : 'No pudimos cambiar el nombre. Probá de nuevo.');
  };
  return <ExploreSheet title="Nombre" onClose={onClose}>
    <TextField label="Nombre de la vista" value={name} maxLength={60} onChangeText={setName} testID="rename-view-name" />
    {error ? <InlineNotice tone="neutral" message={error} /> : null}
    <Button label={busy ? 'Guardando…' : 'Guardar'} disabled={busy || !name.trim()} onPress={() => void save()} testID="rename-view-save" />
  </ExploreSheet>;
}

/** S7 · order by dragging, rename, remove. Every write is checked against the server's version: never a lost update. */
export function ViewsEditScreen() {
  const router = useRouter();
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const { query, compare } = useProgressRange();
  const load = useCallback((c: NonNullable<typeof client>, s: AbortSignal) => fetchProgressViews(c, query, s, compare), [query, compare]);
  const { state, data, refresh } = useProgressResource(client, `views-edit|${progressRequestKey(query, compare)}`, load);
  // A local order only while a reorder is in flight; otherwise the server's order.
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null), [renaming, setRenaming] = useState<ViewRow | null>(null);
  const ids = pendingOrder ?? data?.views.map(v => v.id) ?? [];
  const views = ids.map(id => data?.views.find(v => v.id === id)).filter((v): v is ViewRow => !!v);
  const done = async (message: string | null) => { setNotice(message); await refresh(); };
  const reorder = async (next: string[]) => {
    if (!client || !data) return false;
    setPendingOrder(next); setBusy(true);
    const result = await reorderProgressViews(client, { viewIds: next, expectedListVersion: data.listVersion, idempotencyKey: viewIntentKey() });
    setBusy(false);
    if (result.status === 'ok') { await done(null); setPendingOrder(null); return true; }
    setPendingOrder(null);
    await done(result.status === 'conflict' ? CHANGED : 'No pudimos guardar el orden. Probá de nuevo.');
    return false;
  };
  const remove = (v: ViewRow) => Alert.alert(`¿Sacar “${v.name}”?`, 'Sacar una vista no borra ningún dato.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Sacar', style: 'destructive', onPress: async () => {
      if (!client) return;
      setBusy(true);
      const result = await deleteProgressView(client, v.id, v.version);
      setBusy(false);
      await done(result.status === 'ok' || result.status === 'not_found' ? null : result.status === 'conflict' ? CHANGED : 'No pudimos sacarla. Probá de nuevo.');
    } },
  ]);
  const move = (id: string, direction: number) => {
    const next = [...ids], index = next.indexOf(id), target = index + direction;
    if (busy || index < 0 || target < 0 || target >= next.length) return;
    next.splice(index, 1); next.splice(target, 0, id); void reorder(next);
  };
  return <ScrollScreen testID="views-edit-screen">
    {notice ? <InlineNotice tone="neutral" message={notice} /> : null}
    {state.status === 'loading' ? <SkeletonBlock height={160} />
      : !data ? <InlineUnavailable actionLabel="Reintentar" message="No pudimos cargar tus vistas." onAction={() => void refresh()} />
      : <>
        {views.length ? <NativeReorderList ids={ids} onLift={() => !busy}
          onDrop={next => reorder(next)} onCancel={() => undefined}>
          {views.map((v, index) => <NativeReorderItem key={v.id} id={v.id} gap={0}>
            <View testID={`edit-view-${v.id}`} style={[styles.row, { backgroundColor: colors.background, borderColor: colors.border, borderTopWidth: index ? StyleSheet.hairlineWidth : 0 }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Sacar ${v.name}`} hitSlop={8} disabled={busy} onPress={() => remove(v)} testID={`edit-view-remove-${v.id}`}>
                <AppIcon name="trash" color={colors.danger} size={20} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`${v.name}. Cambiar el nombre`} disabled={busy} onPress={() => setRenaming(v)} style={styles.copy} testID={`edit-view-rename-${v.id}`}>
                <AppText variant="headline" numberOfLines={1}>{v.name}</AppText>
                <AppText muted variant="footnote" numberOfLines={1}>{detail(v)}</AppText>
              </Pressable>
              <NativeDragHandle testID={`edit-view-drag-${v.id}`} holdDelay={120} disabled={busy} accessibilityLabel={`Ordenar ${v.name}`} accessibilityRole="adjustable"
                accessibilityValue={{ min: 1, max: ids.length, now: index + 1 }} accessibilityHint="Mantené y arrastrá la manija, o usá las acciones para mover la vista."
                accessibilityActions={[{ name: 'increment', label: 'Mover abajo' }, { name: 'decrement', label: 'Mover arriba' }]}
                onAccessibilityAction={e => move(v.id, e.nativeEvent.actionName === 'increment' ? 1 : -1)} style={styles.handle}>
                <AppIcon color={colors.textMuted} name="dragHandle" size={20} />
              </NativeDragHandle>
            </View>
          </NativeReorderItem>)}
        </NativeReorderList> : <AppText muted>No tenés vistas fijadas.</AppText>}
        {views.length < PROGRESS_VIEWS_MAX ? <Pressable accessibilityRole="button" onPress={() => { haptics.selection(); router.push('/(tabs)/progress/explore'); }} style={styles.add} testID="edit-view-new">
          <AppIcon name="plus" color={colors.primary} size={20} />
          <AppText variant="headline" style={{ color: colors.primary }}>Nueva vista desde Explorar</AppText>
        </Pressable> : null}
        <AppText muted variant="caption">{views.length} de {PROGRESS_VIEWS_MAX} vistas. Tocá un nombre para cambiarlo. Sacar una vista no borra ningún dato.</AppText>
      </>}
    {renaming ? <RenameSheet view={renaming} onDone={m => void done(m)} onClose={() => setRenaming(null)} /> : null}
  </ScrollScreen>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64 },
  copy: { flex: 1, gap: 2, paddingVertical: 10, minWidth: 0 },
  handle: { alignItems: 'center', justifyContent: 'center', height: 48, width: 48 },
  add: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52 },
});
