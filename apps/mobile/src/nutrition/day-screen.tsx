import type { DayContextAction } from './day-details';
import { NutritionAddMenu, showNutritionAddMenu } from './add-menu';
import { useMealNotice } from './use-meal-notice';
import { NutritionToast, TodayPill } from './nutrition-toast';
import { MealAddedNotice } from './meal-notice';
import {useNutritionConfiguration} from './config-provider';
import {useSavedController} from './use-saved-controller';
import {SavedEditor} from './saved-editor';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AppState, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { selectedRouteDate } from '@/history/navigation';
import { ReturnToHistoryDay } from '@/history/return-to-day';
import { useDomainDate } from '@/history/use-domain-date';
import { useMobileApi } from '@/api';
import { useMobileAuth } from '@/auth';
import { AppText, Button, LoadingState, ScrollScreen, UnavailableState, spacing, usePullRefresh, useOwnlevelTheme } from '@/design-system';
import { nutritionToday } from './day-format';
import { NutritionMonthSheet, prefetchCalendarMonth } from './day-calendar';
import { headerDate } from '@/home/home-day';
import { NutritionGlassButton } from './day-controls';
import { NutritionDayMenu } from './day-menu';
import { NutritionWeek } from './day-week';
import { NutritionDayContent, type MealActions, type MealRemoval } from './day-content';
import { useNutritionDayResource } from './day-resource';
import { useMealController } from './use-meal-controller';
import { useDayWriteController } from './use-day-write-controller';
import { DayWriteEditor } from './day-write-editor';
import { useMetricEntry } from './use-metric-entry';
import { MetricEntrySheet } from './metric-entry-sheet';
import { MetricSavedNotice } from './metric-notice';
import {subscribeMetricDefinitionsChanged} from '@/metrics/presentation-resource';
import type { MobileNutritionDayResponse, NutritionDayMetric } from '@/api/nutrition-day';
import { MealEditor } from './meal-editor';
import { useQuickController } from './use-quick-controller';
import { useFoodController } from './use-food-controller';
import { FoodEditor } from './food-editor';
import { foodQuickOption } from '@/api/nutrition-food';
import { QuickEditor } from './quick-editor';
import { useNutritionHomeEntry, type AddEntry } from './home-entry';

function NutritionDayView({ revision, date, today, onSelect, onServerToday, onAdd, addChoices, addControl, highlightedMeal, removal, onManageFoods, onManageSaved, onConfigure, mealActions, onActivity, onContext, onMetric }: {
  /** Bumped after a confirmed write: the day re-reads in place, so its numbers can move to the new values. */
  revision: number;
  date: string; today: string; onSelect: (date: string) => void; onServerToday: (date: string) => void;
  onAdd?: () => void; mealActions?: MealActions;
  onConfigure?: () => void; addChoices?: ReactNode; addControl?: ReactNode; highlightedMeal?: string; removal?: MealRemoval; onManageFoods?: () => void; onManageSaved?: () => void;
  onMetric?: (data: MobileNutritionDayResponse, metric: NutritionDayMetric) => void;
  onActivity?: (data: MobileNutritionDayResponse) => void; onContext?: DayContextAction;
}) {
  const router = useRouter();
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const { state, refresh, reload } = useNutritionDayResource(client, date);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [selector, setSelector] = useState(false);
  const current = state.status === 'ready' ? state.current
    : state.status === 'unavailable' ? state.previous : undefined;
  const serverToday = current?.data.today;
  useEffect(() => { if (serverToday) onServerToday(serverToday); }, [serverToday, onServerToday]);
  const selectedLabel = `${headerDate(date)}${date.slice(0, 4) !== today.slice(0, 4) ? ` de ${date.slice(0, 4)}` : ''}`;
  const runRefresh = useCallback(() => { setRefreshRevision(v => v + 1); return refresh(); }, [refresh]);
  useEffect(() => { if (revision > 0) void reload(); }, [reload, revision]);
  // The calendar's month is read ahead, once this day has loaded (it never competes with it).
  const loaded = state.status === 'ready';
  useEffect(() => { if (loaded) prefetchCalendarMonth(client, date, today); }, [client, date, loaded, today]);
  const pull = usePullRefresh(state.status === 'ready' && state.refreshing, runRefresh);
  return <ScrollScreen statusBarGlass testID="nutrition-day-screen" refreshControl={
    <RefreshControl colors={[colors.primary]} onRefresh={pull.onRefresh}
      progressBackgroundColor={colors.surface} refreshing={pull.refreshing}
      testID="nutrition-refresh" tintColor={colors.primary} />
  }>
    <View style={styles.header}>
      <ReturnToHistoryDay />
      <View style={styles.topBar}>
        <View style={styles.title}>
          <AppText muted variant="footnote">{selectedLabel}</AppText>
          <AppText accessibilityRole="header" variant="largeTitle">{date === today ? 'Hoy' : selectedLabel.split(' ').slice(1).join(' ')}</AppText>
        </View>
        {/* Part of the header: they scroll away with the page, never float over the numbers. */}
        <View style={styles.controls} testID="nutrition-day-controls">
          <NutritionGlassButton icon="calendar" label="Elegir fecha" onPress={() => setSelector(true)} />
          <NutritionDayMenu onSaved={onManageSaved} onFoods={onManageFoods} onPlan={onConfigure} onEnergy={() => router.push('/settings/energy')} onPhysical={() => router.push('/settings/physical')} />
        </View>
      </View>
    </View>
    <NutritionWeek refreshRevision={refreshRevision + revision} date={date} today={today} data={current?.data} onSelect={onSelect} />
    {!current ? state.status === 'loading' ? <LoadingState label="Cargando día nutricional" />
      : <UnavailableState title="No pudimos cargar este día"
        description={state.status === 'auth_required' || state.status === 'unauthorized' ? 'No pudimos confirmar tu sesión.' : 'Revisá la conexión e intentá nuevamente.'}
        action={<Button label="Reintentar" onPress={runRefresh} />} />
      : <>
        {state.status !== 'ready' ? <View style={styles.header}>
          <AppText accessibilityRole="alert">No pudimos actualizar. Mostramos la última lectura de esta fecha.</AppText>
          <Button label="Reintentar" onPress={runRefresh} variant="secondary" />
        </View> : null}
        <NutritionDayContent data={current.data} onAdd={onAdd} addChoices={addChoices} addControl={addControl} highlightedMeal={highlightedMeal} removal={removal} mealActions={state.status === 'ready' ? mealActions : undefined}
          onMetric={state.status === 'ready' ? onMetric : undefined} onActivity={state.status === 'ready' ? onActivity : undefined} onContext={state.status === 'ready' ? onContext : undefined} />
      </>}
    {!current ? <>{addControl ?? <NutritionGlassButton icon="plus" label="Agregar comida" wide onPress={onAdd} />}{addChoices}</> : null}
    {selector ? <NutritionMonthSheet date={date} today={today} onClose={() => setSelector(false)} onSelect={onSelect} /> : null}
  </ScrollScreen>;
}

export function NutritionDayScreen() {
  const { session } = useMobileAuth();
  return <NutritionUserDayScreen key={session?.user.id ?? 'anonymous'} userId={session?.user.id ?? 'anonymous'} />;
}
function NutritionUserDayScreen({ userId }: { userId: string }) {
  const params = useLocalSearchParams();
  const router = useRouter();
  const routeDate = selectedRouteDate(params);
  const { client } = useMobileApi();
  const [revision, setRevision] = useState(0);
  useEffect(()=>{if(client)return subscribeMetricDefinitionsChanged(client,userId,()=>setRevision(n=>n+1));},[client,userId]);
  const invalidate = useCallback(() => setRevision(v => v + 1), []);
  // Shared with Settings (one controller/intent per user); its editor is hosted by the provider.
  const config = useNutritionConfiguration(invalidate);
  const meals = useMealController(client, userId, invalidate);
  const writes = useDayWriteController(client, userId, invalidate);
  const quick = useQuickController(client, userId, invalidate);
  const foods = useFoodController(client, userId);
  const quickController=quick?.controller;
  const invalidateQuick=useCallback(()=>{if(quickController)void quickController.loadOptions();},[quickController]);
  const saved=useSavedController(client,userId,invalidateQuick);

  const [today, setToday] = useState(() => nutritionToday());
  const [selected, setSelected] = useDomainDate(routeDate);
  // Today follows Cordoba midnight on focus/foreground; a chosen date stays fixed.
  const updateToday = useCallback(() => setToday(nutritionToday()), []);
  useFocusEffect(useCallback(() => { updateToday(); }, [updateToday]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') updateToday(); });
    return () => subscription.remove();
  }, [updateToday]);
  const date = selected ?? today;
  const metricEntry = useMetricEntry(writes?.controller, date);
  const mealNotice = useMealNotice(meals?.controller, quick?.controller, date);
  const editable = meals?.state.phase === 'idle' && !meals.state.intent && writes?.state.phase === 'idle' && !writes.state.intent
    && quick?.state.phase === 'idle' && !quick.state.intent && foods?.state.phase === 'idle' && !foods.state.intent && saved?.state.phase==='idle' && !saved.state.intent && config?.state.phase==='idle' && !config.state.intent;
  const showToday = useCallback(() => { updateToday(); setSelected(null); }, [setSelected, updateToday]);
  const openAdd = useCallback((entry: AddEntry) => {
    if (entry === 'manual') meals?.controller.open(today);
    else if (entry === 'food') foods?.controller.open(today);
    else showNutritionAddMenu({ onManual: () => meals?.controller.open(today), onQuick: () => quick?.controller.open(today), onFood: () => foods?.controller.open(today) });
  }, [foods, meals, quick, today]);
  useNutritionHomeEntry({ add: params.add, editable: !!editable, onAdd: openAdd, onShowToday: showToday, quick, quickParam: params.quick, today });
  // Status and recovery messages live in the scrolling content (under "Agregar comida"), never loose over the tab bar.
  const statusBanners = <>
    {meals?.state.message && !meals.state.editor ? <View style={styles.header}><AppText accessibilityRole="alert">{meals.state.message}</AppText>
      {meals.state.intent ? <Button label="Revisar intento guardado" onPress={() => meals.controller.showRecovery()} /> : null}
      {meals.state.phase === 'blocked' ? <Button label="Comprobar almacenamiento" onPress={() => void meals.controller.recover()} /> : null}</View> : null}
    {writes?.state.message && !writes.state.draft && !metricEntry.notice && !(metricEntry.feedbackHandled && writes.state.message === 'Cambios guardados.') ? <View style={styles.header}><AppText accessibilityRole="alert">{writes.state.message}</AppText>
      {writes.state.intent ? <Button label="Revisar intento de actividad/contexto" onPress={() => writes.controller.showRecovery()} /> : null}
      {writes.state.phase === 'blocked' ? <Button label="Comprobar almacenamiento del día" onPress={() => void writes.controller.recover()} /> : null}</View> : null}
    {quick?.state.message && quick.state.message !== 'Comida registrada.' && !quick.state.open ? <View style={styles.header}><AppText accessibilityRole="alert">{quick.state.message}</AppText>
      {quick.state.intent ? <Button label="Revisar intento rápido" onPress={() => quick.controller.showRecovery()} /> : null}
      {quick.state.phase === 'blocked' ? <Button label="Comprobar almacenamiento rápido" onPress={() => void quick.controller.recover()} /> : null}</View> : null}
    {foods?.state.message && !foods.state.open ? <View style={styles.header}><AppText accessibilityRole="alert">{foods.state.message}</AppText>
      {foods.state.intent ? <Button label="Revisar intento de catálogo" onPress={() => foods.controller.showRecovery()} /> : null}
      {foods.state.phase === 'blocked' ? <Button label="Comprobar almacenamiento de alimentos" onPress={() => void foods.controller.recover()} /> : null}</View> : null}
    {saved?.state.message&&!saved.state.open?<View style={styles.header}><AppText accessibilityRole="alert">{saved.state.message}</AppText>{saved.state.intent?<Button label="Revisar intento de guardadas" onPress={()=>saved.controller.showRecovery()}/>:null}{saved.state.phase==='blocked'?<Button label="Comprobar almacenamiento de guardadas" onPress={()=>void saved.controller.recover()}/>:null}</View>:null}
    {config?.state.message && !config.state.open ? <View style={styles.header}><AppText accessibilityRole="alert">{config.state.message}</AppText>{config.state.intent ? <Button label="Comprobar cambio guardado" onPress={()=>config.controller.showRecovery()} /> : null}{config.state.phase==='blocked'?<Button label="Comprobar cambio" onPress={()=>void config.controller.recover()}/>:null}</View>:null}
  </>;
  return <>
    <NutritionDayView key={`${userId}:${date}`} revision={revision} date={date} today={today}
      onSelect={setSelected} onServerToday={setToday}
      addControl={<NutritionAddMenu onManual={editable ? () => meals.controller.open(date) : undefined} onQuick={editable ? () => quick.controller.open(date) : undefined} onFood={editable ? () => foods.controller.open(date) : undefined} />}
      addChoices={statusBanners}
      highlightedMeal={mealNotice.notice?.meal.id} removal={{ removing: mealNotice.removing, removed: mealNotice.removed }}
      onConfigure={()=>router.push('/settings/stages')}
      onManageSaved={editable?()=>saved.controller.open():undefined}
      onManageFoods={editable ? () => foods.controller.open(null) : undefined}
      mealActions={editable ? {
        edit: meal => meals.controller.open(date, meal),
        // "Repetir" loads it again today by default; the Día chip in the form moves it elsewhere.
        repeat: meal => meals.controller.repeat(today, meal),
        save: meal => saved.controller.prefill({ name: (meal.title || meal.description || '').slice(0, 120), description: meal.description ?? '',
          calories: meal.calories == null ? '' : String(Math.round(meal.calories)), ...Object.fromEntries((['proteinG', 'carbsG', 'fatG'] as const).map(k => [k, meal[k] == null ? '' : String(meal[k]).replace('.', ',')])) as Record<'proteinG' | 'carbsG' | 'fatG', string> }),
        remove: meal => void mealNotice.undo(meal, date),
      } : undefined}
      onMetric={editable ? metricEntry.open : undefined}
      onActivity={editable ? data => writes.controller.open('metrics', data) : undefined}
      onContext={editable ? (data, reset) => { writes.controller.open('context', data); if (reset && writes.controller.getSnapshot().draft?.baseline === data) { writes.controller.changeContext(reset, ''); void writes.controller.save(); } } : undefined} />
    {quick && !(foods?.state.open && foods.state.mode === 'register') ? <QuickEditor controller={quick.controller} state={quick.state} externalLocked={!editable} onSaved={() => { quick.controller.close(); saved?.controller.open(); }} /> : null}
    {foods && quick ? <FoodEditor controller={foods.controller} state={foods.state} quick={quick} onChoose={food => { quick.controller.open(foods.state.date!, foodQuickOption(food)); foods.controller.registration(); }} /> : null}
    {saved?<SavedEditor controller={saved.controller} state={saved.state}/>:null}
    {writes && metricEntry.entry && writes.state.draft ? <MetricEntrySheet id={metricEntry.entry.id} controller={writes.controller} state={writes.state} onClose={metricEntry.close} /> : null}
    {/* An undo from the notice never shows the full metrics editor; only a write that really needs recovery does. */}
    {writes && !metricEntry.entry && !(metricEntry.undoing && !['uncertain', 'blocked', 'conflict'].includes(writes.state.phase)) ? <DayWriteEditor controller={writes.controller} state={writes.state} /> : null}
    {metricEntry.undoing && writes && ['pending', 'confirmed'].includes(writes.state.phase) ? <MetricSavedNotice notice={{ date, message: 'Deshaciendo…', undo: null }} disabled pending onUndo={() => {}} onClose={() => {}} /> : null}
    {metricEntry.notice ? <MetricSavedNotice notice={metricEntry.notice} disabled={!editable || !!writes?.state.draft} onUndo={metricEntry.undoNotice} onClose={metricEntry.dismissNotice} /> : null}
    {/* Another day shown and no notice on screen: a discreet way back to today. */}
    {date !== today && !(quick?.state.inlineKey && !quick.state.open) && !mealNotice.undoing && !mealNotice.result && !mealNotice.notice && !metricEntry.notice && !metricEntry.undoing ? <TodayPill onPress={showToday} /> : null}
    {/* One notice at a time: an add closed mid-way, a delete/undo running, its brief confirmation, or "Guardado · Deshacer". */}
    {quick?.state.inlineKey && !quick.state.open ? <NutritionToast testID="nutrition-quick-pending" state="pending" message="Agregando…" />
      : mealNotice.undoing ? <NutritionToast testID="nutrition-meal-pending" state="pending" message={mealNotice.undoing === 'undo' ? 'Deshaciendo…' : 'Eliminando…'} />
      : mealNotice.result ? <NutritionToast testID="nutrition-meal-result" state="done" message={mealNotice.result.message} />
      : mealNotice.notice ? <MealAddedNotice notice={mealNotice.notice} disabled={!editable || !!meals?.state.editor} pending={false} onUndo={() => void mealNotice.undo()} onClose={mealNotice.dismiss} /> : null}
    {meals ? <MealEditor controller={meals.controller} state={meals.state} /> : null}
  </>;
}
const styles = StyleSheet.create({
  header: { gap: spacing.md }, topBar: { flexDirection: 'row', alignItems: 'center', gap: 8 }, title: { flex: 1, gap: 0 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
