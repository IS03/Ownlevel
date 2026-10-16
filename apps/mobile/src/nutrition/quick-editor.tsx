import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppIcon, AppText, Button, Heading, LoadingState, Surface, useOwnlevelTheme } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import type { QuickNutrients, QuickSection } from '@/api/nutrition-quick';
import { displayNutritionDate } from './day-format';
import type { QuickController, QuickState } from './quick-controller';
import { MealSheet, MealSearch, mealShown as shown, mealSheetStyles as shared } from './meal-sheet';
import { MealTiming } from './meal-timing';
import { MealProjection } from './meal-projection';
import { quickEstimate } from './quick-model';
import { MealDateControl } from './meal-date-control';
import { SaveButton } from './save-button';
/** `pending`: an instant estimate the server is still confirming (muted, with the native spinner). */
export function MealNutrients({ value, pending = false }: { value: QuickNutrients; pending?: boolean }) {
  const { colors } = useOwnlevelTheme();
  return <View style={shared.totals}><View style={styles.total}><AppText numeric variant="title1" style={pending && { color: colors.textMuted }}>{shown(value.calories)} <AppText muted>kcal</AppText></AppText>
    {pending ? <ActivityIndicator color={colors.textMuted} accessibilityLabel="Confirmando valores" /> : null}</View>
    <AppText numeric muted variant="footnote">{`P ${shown(value.proteinG)} · C ${shown(value.carbsG)} · G ${shown(value.fatG)}`}</AppText></View>;
}
export function QuickEditor({ controller, state, embedded = false, onBack, onSaved, externalLocked = false }: { controller: QuickController; state: QuickState; embedded?: boolean; onBack?: () => void; onSaved?: () => void; externalLocked?: boolean }) {
  const { colors } = useOwnlevelTheme();
  const [search, setSearch] = useState('');
  const [more, setMore] = useState(false);
  const draft = state.inlineKey ? null : state.draft;
  const estimate = draft ? quickEstimate(draft) : null;
  const locked = externalLocked || !!state.intent || state.phase !== 'idle' || !!state.inlineKey;
  const running = state.phase === 'pending' || state.phase === 'loading';
  // Sent and confirmed while the day is re-read: still "saving" (no recovery choices flashing by).
  const saving = state.phase === 'pending' || (state.phase === 'confirmed' && !state.message);
  // Preview only: debounce quantity edits, cancel stale work in the controller.
  useEffect(() => {
    if (!state.open || !draft || locked || state.preview || state.previewLoading || state.message) return;
    const timer = setTimeout(() => void controller.requestPreview(), 250);
    return () => clearTimeout(timer);
  }, [controller, draft, locked, state.open, state.preview, state.previewLoading, state.message]);
  const [wasOpen, setWasOpen] = useState(state.open);
  if (wasOpen !== state.open) { setWasOpen(state.open); if (!state.open) { setSearch(''); setMore(false); } }
  if (!state.open || !state.date) return null;
  const close = () => {
    if (running || state.inlineKey && state.previewLoading) return;
    if (!state.intent && controller.dirty()) Alert.alert('¿Descartar ajustes?', 'Estas cantidades todavía no se registraron.', [
      { text: 'Seguir revisando', style: 'cancel' }, { text: 'Descartar', style: 'destructive', onPress: () => controller.close() },
    ]); else controller.close();
  };
  const back = () => {
    const action = onBack ?? (() => controller.back());
    if (controller.dirty()) Alert.alert('¿Descartar ajustes?', 'Podés volver a elegir otra opción.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Descartar', style: 'destructive', onPress: action }]);
    else action();
  };
  const section = (title: string, data?: QuickSection) => {
    const matches = data?.status === 'ok' ? data.items.filter(o => `${o.name} ${o.description ?? ''}`.toLocaleLowerCase('es-AR').includes(search.trim().toLocaleLowerCase('es-AR'))) : [];
    return <View style={{ gap: 4 }}><View style={shared.totals}><Heading level={2}>{title}</Heading>{title === 'Guardadas' && onSaved ? <Button label="Ver todas" variant="quiet" onPress={onSaved} disabled={locked} /> : null}</View>
      {data?.status === 'unavailable' ? <AppText accessibilityRole="alert">No pudimos cargar estas opciones.</AppText> : data?.status === 'ok' ? matches.length ? matches.slice(0, title === 'Para vos' && !search.trim() && !more ? 3 : undefined).map(option => {
        const key = `${option.source.kind}:${option.source.id}`, added = state.added?.[key], pending = state.inlineKey === key;
        return <View key={key} style={[shared.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
          <View style={shared.text}><Pressable accessibilityRole="button" accessibilityLabel={`Revisar ${option.name}`} disabled={locked} onPress={() => controller.choose(option)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText variant="headline">{option.name}</AppText>
            {/* An added option keeps its macros; the check says it is in the day, and undoing happens from the day. */}
            <AppText muted numeric variant="caption">{`P ${shown(option.proteinG)} · C ${shown(option.carbsG)} · G ${shown(option.fatG)}${option.items.length ? ` · ${option.items.length} ingredientes` : ''}`}</AppText>
          </Pressable></View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}><AppText numeric variant="subheadline">{shown(option.calories)} kcal</AppText>{option.useCount !== null ? <AppText muted variant="caption">{option.useCount} veces</AppText> : null}</View>
          <Pressable accessibilityRole="button" accessibilityLabel={added ? `${option.name} agregado` : `Agregar ${option.name}`} accessibilityState={{ disabled: locked || !!added, busy: pending }} disabled={locked || !!added} onPress={() => { void controller.addInline(option); }} style={[styles.add, { backgroundColor: added ? colors.primary : colors.brandSubtle }]}>
            {pending ? <ActivityIndicator color={colors.primary} /> : <AppIcon name={added ? 'checkmark' : 'plus'} size={20} color={added ? colors.onPrimary : colors.primary} />}
          </Pressable>
        </View>;
      }) : <AppText muted>{search.trim() ? 'No encontramos comidas con esa búsqueda.' : title === 'Guardadas' ? 'Todavía no tenés comidas guardadas.' : 'Tus comidas frecuentes van a aparecer acá.'}</AppText> : null}
      {title === 'Para vos' && !search.trim() && matches.length > 3 ? <Button label={more ? 'Ver menos' : 'Ver más sugerencias'} variant="quiet" onPress={() => setMore(!more)} /> : null}
    </View>;
  };
  return <MealSheet title={draft?.option.name ?? 'Rápido'} subtitle={draft ? draft.option.source.kind === 'food' ? `Alimento · ${shown(draft.option.items[0].quantity, 3)} ${draft.option.items[0].unit} = ${shown(draft.option.calories)} kcal` : draft.option.templateType === 'composite' ? `Guardada · ${draft.option.items.length} ingredientes` : 'Ajustar comida' : undefined}
    onClose={draft && !state.intent ? back : close} onDismiss={close} dismissable={!state.intent && !controller.dirty()}
    back={!!draft && !state.intent} running={running || !!state.inlineKey} embedded={embedded} testID="quick-meal-editor"
    right={<MealDateControl date={state.date} disabled={locked} onChange={date => controller.changeDate(date)} />}>
    {!draft ? <>
      <MealSearch label="Buscar en tus comidas" value={search} onChange={setSearch} />
      {state.optionsLoading ? <LoadingState label="Cargando opciones rápidas" /> : null}
      {state.optionsError ? <AppText accessibilityRole="alert">No pudimos actualizar las opciones.</AppText> : null}
      {section('Para vos', state.options?.suggested)}{section('Guardadas', state.options?.saved)}
      {(state.optionsError || state.options?.saved.status === 'unavailable' || state.options?.suggested.status === 'unavailable') ? <Button label="Reintentar opciones" onPress={() => void controller.loadOptions()} variant="quiet" /> : null}
    </> : <>
      {draft.option.items.map(item => {
        const value = draft.quantities[item.id], numeric = Number(value?.replace(',', '.')), step = draft.option.source.kind === 'food' ? item.quantity : ['g', 'ml'].includes(item.unit.toLowerCase()) ? 10 : Math.min(item.quantity, 1);
        const change = (delta: number) => { if (!locked && Number.isFinite(numeric)) { triggerHaptic('stepperChange'); controller.change(item.id, String(Math.max(draft.option.source.kind === 'food' ? 0.001 : 0.01, Math.round((numeric + delta * step) * 1000) / 1000)).replace('.', ',')); } };
        return <View key={item.id} style={[shared.row, draft.option.source.kind === 'food' && styles.foodQuantity]}>
          {draft.option.source.kind !== 'food' ? <View style={shared.text}><AppText variant="headline">{item.label}</AppText><AppText muted numeric variant="caption">{shown(state.preview?.items.find(i => i.id === item.id)?.calories)} kcal</AppText></View> : null}
          <View style={[styles.stepper, { backgroundColor: colors.surface }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Restar ${item.label}`} disabled={locked || numeric <= step} onPress={() => change(-1)} style={styles.step}><AppText muted>−</AppText></Pressable>
            <View style={{ alignItems: 'center', flexShrink: 1 }}><TextInput accessibilityLabel={`Cantidad de ${item.label}`} editable={!locked} keyboardType="decimal-pad" selectTextOnFocus value={value} onChangeText={v => controller.change(item.id, v)} style={[styles.quantity, draft.option.source.kind === 'food' && shared.number, { color: colors.text }]} /><AppText muted variant="caption">{item.unit}</AppText></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Sumar ${item.label}`} disabled={locked} onPress={() => change(1)} style={styles.step}><AppText>+</AppText></Pressable>
          </View>
          {state.errors[item.id] ? <AppText accessibilityRole="alert">{state.errors[item.id]}</AppText> : null}
        </View>;
      })}
      {draft.option.source.kind === 'food' ? <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>{[1, 2, 3, 4].map(m => Math.round(draft.option.items[0].quantity * m * 1000) / 1000).map(n => <Pressable key={n} accessibilityRole="button" accessibilityLabel={`Cantidad ${n}`} disabled={locked} onPress={() => controller.change(draft.option.items[0].id, String(n))} style={[styles.chip, { backgroundColor: Number(draft.quantities[draft.option.items[0].id]?.replace(',', '.')) === n ? colors.brandSubtle : colors.surface }]}><AppText numeric>{n}</AppText></Pressable>)}</View> : null}
      {state.previousDraft?.option.items.length ? <Surface><AppText variant="label">Tus cantidades anteriores, para revisar</AppText>{state.previousDraft.option.items.map(i => <AppText key={i.id}>{`${i.label}: ${state.previousDraft!.quantities[i.id]} ${i.unit}`}</AppText>)}</Surface> : null}
      {/* The same block stays put: an instant estimate first, then the server's confirmed preview. */}
      {state.preview ? <View style={{ gap: 20 }} testID="quick-preview"><MealNutrients value={state.preview.snapshot} /><MealProjection date={state.date} nutrients={state.preview.snapshot} /></View>
        : estimate && !state.message ? <View style={{ gap: 20 }} testID="quick-estimate"><MealNutrients value={estimate} pending /><MealProjection date={state.date} nutrients={estimate} pending /></View>
        : state.previewLoading ? <LoadingState label="Calculando vista previa" /> : null}
      <MealTiming date={state.date} value={draft} disabled={locked} onChange={(label, time) => controller.timing(label, time)} />
      <View style={shared.footer}>
        <SaveButton state={saving && !state.inlineKey ? 'saving' : 'idle'} disabled={locked || !state.preview || state.previewLoading} label={`Agregar al día${state.preview ? ` · ${shown(state.preview.snapshot.calories)} kcal` : estimate && !state.message ? ` · ${shown(estimate.calories)} kcal` : ''}`} onPress={() => void controller.save()} />
        {draft.option.source.kind === 'suggestion' ? <Button disabled={locked || !state.preview || state.previewLoading} label="Guardar como habitual" onPress={() => void controller.save('saveSuggestion')} variant="quiet" /> : null}
      </View>
    </>}
    {state.message && state.message !== 'Comida registrada.' ? <AppText accessibilityRole="alert" selectable>{state.message}</AppText> : null}
    {state.phase === 'idle' && !state.preview && !state.previewLoading && state.message && state.draft ? <Button label="Reintentar vista previa" onPress={() => void controller.requestPreview()} variant="quiet" /> : null}
    {state.phase === 'conflict' ? <Surface>{state.truth ? <><AppText variant="headline">La opción cambió</AppText><AppText>{state.truth.name}</AppText><MealNutrients value={state.truth} /><Button label="Revisar la versión actual" onPress={() => { controller.reviewTruth(); void controller.requestPreview(); }} /></> : <AppText>No hay una opción actual confirmada. Conservamos tus cantidades.</AppText>}<Button label="Actualizar fuente" disabled={state.optionsLoading} onPress={() => void controller.loadOptions()} variant="quiet" /><Button label="Elegir otra opción" onPress={() => { controller.back(); }} variant="quiet" /></Surface> : null}
    {['uncertain', 'confirmed', 'blocked'].includes(state.phase) && !saving ? <Button label={state.intent?.receipt ? 'Actualizar datos confirmados' : 'Comprobar intento guardado'} onPress={() => void controller.recover()} /> : null}
    {state.intent && !saving ? <Button label="Volver al día · conservar intento" disabled={running} onPress={close} variant="quiet" /> : null}
    {!draft && !state.intent ? <AppText muted variant="caption">Destino · {displayNutritionDate(state.date)}</AppText> : null}
  </MealSheet>;
}
const styles = StyleSheet.create({ total: { flexDirection: 'row', alignItems: 'center', gap: 8 }, add: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' }, stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingVertical: 4, flexShrink: 1 }, step: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, quantity: { fontSize: 17, fontWeight: '600', textAlign: 'center', minWidth: 50, maxWidth: 180, fontVariant: ['tabular-nums'] }, foodQuantity: { justifyContent: 'center', flexWrap: 'wrap' }, chip: { minWidth: 50, minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' } });
