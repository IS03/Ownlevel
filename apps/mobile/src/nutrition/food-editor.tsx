import { useEffect } from 'react';
import { Alert, Modal, View } from 'react-native';
import { AppText, Button, LinkRow, LoadingState, useReduceMotion } from '@/design-system';
import type { PersonalFood } from '@/api/nutrition-food';
import { foodLabels, scaleFoodDraftTo, tooPrecise, validateFoodDraft, type FoodDraft } from './food-model';
import { UnitMenu } from './unit-menu';
import type { FoodController, FoodState } from './food-controller';
import type { QuickController, QuickState } from './quick-controller';
import { QuickEditor } from './quick-editor';
import { FoodAddPicker } from './food-add-picker';
import { displayNutritionDate } from './day-format';
import { NutritionGlassButton } from './day-controls';
import { LibraryEditorMenu } from './library-editor-menu';
import {
  LibraryField,
  LibraryFilter,
  LibraryNutrients,
  LibraryRow,
  LibrarySearch,
  LibrarySheet,
  libraryMacros,
  libraryStyles as styles,
  useLibraryNotice,
} from './library-ui';
import { mealShown } from './meal-sheet';
function Summary({ food }: { food: PersonalFood }) {
  return (
    <>
      <AppText
        numeric
      >{`${mealShown(food.servingQuantity, 3)} ${food.servingUnit} · ${mealShown(food.calories)} kcal`}</AppText>
      <AppText muted numeric>
        {libraryMacros(food)}
      </AppText>
      {!food.isActive ? <AppText>Archivado</AppText> : null}
    </>
  );
}
export function FoodEditor({
  controller,
  state,
  quick,
  onChoose,
}: {
  controller: FoodController;
  state: FoodState;
  quick: { controller: QuickController; state: QuickState };
  onChoose: (food: PersonalFood) => void;
}) {
  const reduced = useReduceMotion(),
    notice = useLibraryNotice(controller);
  const pending = state.phase === 'pending' || state.phase === 'loading',
    locked = state.phase !== 'idle' || !!state.intent;
  useEffect(() => {
    if (state.open && state.mode === 'register' && !quick.state.open) controller.close();
  }, [state.open, state.mode, quick.state.open, controller]);
  if (!state.open) return null;
  const close = () => {
    if (pending || quick.state.phase === 'pending') return;
    const dirty = state.mode === 'register' ? quick.controller.dirty() : controller.dirty();
    const exit = () => {
      if (state.mode === 'register') quick.controller.close();
      controller.discard();
      controller.close();
    };
    if (dirty && !state.intent && !quick.state.intent)
      Alert.alert('¿Descartar cambios?', 'Conservá el editor abierto si querés seguir revisando.', [
        { text: 'Seguir revisando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: exit },
      ]);
    else exit();
  };
  const back = () => {
    if (state.intent) {
      close();
      return;
    }
    if (controller.dirty())
      Alert.alert('¿Descartar cambios?', 'Estos cambios del alimento no están guardados.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: () => { controller.discard(); controller.back(); } },
      ]);
    else controller.back();
  };
  const action = (op: 'archive' | 'reactivate' | 'delete', food = state.editing) => {
    if (!food || locked) return;
    Alert.alert(
      op === 'delete' ? '¿Eliminar alimento?' : op === 'archive' ? '¿Archivar alimento?' : '¿Restaurar alimento?',
      `Las comidas registradas y los componentes guardados no cambian.${controller.dirty() ? ' Los cambios del formulario sin guardar se descartarán.' : ''}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: op === 'delete' ? 'Eliminar' : op === 'archive' ? 'Archivar' : 'Restaurar',
          style: op === 'delete' ? 'destructive' : 'default',
          onPress: () => {
            if (state.mode === 'browse') controller.begin(food);
            void controller.save(op);
          },
        },
      ],
    );
  };
  const browse = state.mode === 'browse',
    draft = state.draft;
  const check = draft ? validateFoodDraft(draft) : null;
  const valid = !!check?.fields,
    saveDisabled = locked || !valid || !controller.dirty();
  // Shown while typing, not only after a save attempt: a disabled Guardar never stays unexplained.
  // Only about what was typed: an empty form never opens with a complaint. Missing fields are said when saving.
  const live = draft && !valid ? Object.entries(check?.errors ?? {}).filter(([key]) => !!draft[key as keyof FoodDraft]?.trim()) : [];
  const unit = draft?.servingUnit.trim() || 'unidad';
  // 100 g or 100 ml is how labels read; «100 unidades» is not, so other units only get the precision note.
  const precise = !!draft && tooPrecise(draft), scaled = draft && precise && (unit === 'g' || unit === 'ml') ? scaleFoodDraftTo(draft) : null;
  // Swiping the sheet away keeps an unsaved draft for next time instead of asking after the sheet is already gone.
  // Reads the controllers at the moment of the swipe, not this render: the same sheet goes from the list to an editor and a
  // gesture may still hold an earlier version of this function.
  const swipeClose = () => {
    const now = controller.getSnapshot();
    if (now.phase === 'pending' || now.phase === 'loading' || quick.controller.getSnapshot().phase === 'pending') return;
    if (now.mode === 'register') { quick.controller.close(); controller.close(); return; }
    if (now.mode === 'browse') controller.close(); else controller.shelve();
  };
  const input = (key: keyof FoodDraft, label = foodLabels[key], big = false) => (
    <LibraryField
      label={label}
      value={draft![key]}
      disabled={locked}
      numeric={['servingQuantity', 'calories', 'proteinG', 'carbsG', 'fatG'].includes(key)}
      big={big}
      multiline={key === 'description'}
      placeholder={
        key === 'name'
          ? 'Nombre del alimento'
          : key === 'description'
            ? 'Descripción (opcional)'
            : key === 'sourceNote'
              ? 'Fuente (opcional)'
              : key === 'servingUnit'
                ? 'Unidad'
                : undefined
      }
      onChange={(v) => controller.change(key, v)}
    />
  );
  const editor = (
    <LibrarySheet
      embedded={!!state.date}
      title={browse ? 'Alimentos' : state.mode === 'create' ? 'Nuevo alimento' : 'Editar alimento'}
      browse={browse}
      testID="food-editor"
      running={pending}
      onClose={browse ? close : back}
      onSwipeClose={swipeClose}
      right={
        !browse && state.editing ? (
              <LibraryEditorMenu
                disabled={locked}
                actions={[
                  {
                    label: state.editing.isActive ? 'Archivar' : 'Restaurar',
                    symbol: 'archivebox',
                    onPress: () => action(state.editing!.isActive ? 'archive' : 'reactivate'),
                  },
                  { label: 'Eliminar alimento', symbol: 'trash', destructive: true, onPress: () => action('delete') },
                ]}
              />
        ) : undefined
      }
      // Only when it holds something: an empty footer still kept its padding below the list (#306).
      footer={
        notice.notice || (!browse && draft) ? (
          <>
            {notice.notice}
            {!browse && draft ? (
              <Button
                label={pending ? 'Guardando…' : 'Guardar'}
                disabled={saveDisabled}
                onPress={() => void controller.save()}
              />
            ) : null}
          </>
        ) : undefined
      }
    >
      {state.date ? <AppText muted>{`Destino · ${displayNutritionDate(state.date)}`}</AppText> : null}
      {browse ? (
        <>
          <LibrarySearch label="Buscar alimento" value={state.search} onChange={(v) => controller.query(v)} />
          <LibraryFilter filter={state.filter} onChange={(f) => controller.setFilter(f)} />
          <NutritionGlassButton
            wide
            icon="plus"
            label="Nuevo alimento"
            onPress={locked ? undefined : () => controller.begin()}
          />
          {state.listLoading ? <LoadingState label="Cargando alimentos" /> : null}
          {state.listError ? (
            <View style={styles.section}>
              <AppText accessibilityRole="alert">
                No pudimos actualizar el catálogo.{state.foods ? ' Mostramos la última lectura.' : ''}
              </AppText>
              <Button label="Reintentar catálogo" onPress={() => void controller.load()} variant="quiet" />
            </View>
          ) : null}
          {state.foods?.length === 0 && !state.listError && !state.listLoading ? (
            <AppText muted>
              {state.search.trim()
                ? 'No encontramos alimentos con esa búsqueda.'
                : state.filter === 'archived'
                  ? 'No tenés alimentos archivados.'
                  : 'Todavía no creaste alimentos. Agregá uno con su porción y valores nutricionales.'}
            </AppText>
          ) : null}
          <View>
            {state.foods?.map((food) => (
              <LibraryRow
                key={food.id}
                testID={`library-food-${food.id}`}
                name={food.name}
                calories={food.calories}
                active={food.isActive}
                detail={`${mealShown(food.servingQuantity, 3)} ${food.servingUnit} · ${libraryMacros(food)}`}
                disabled={locked || state.listError || state.listLoading}
                highlighted={notice.highlighted === food.id}
                onOpen={() => controller.begin(food)}
                onArchive={() => action(food.isActive ? 'archive' : 'reactivate', food)}
              />
            ))}
          </View>
        </>
      ) : draft ? (
        <>
          {input('name')}
          {/* The portion first: every value below is for that amount. */}
          <View style={styles.section}>
            <AppText variant="headline">Porción base</AppText>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>{input('servingQuantity')}</View>
              <View style={{ flex: 1 }}>
                <UnitMenu value={draft.servingUnit} disabled={locked} onChange={(v) => controller.change('servingUnit', v)} />
              </View>
            </View>
          </View>
          <LibraryNutrients fields={(key, label, big) => input(key, label, big)} />
          <AppText muted numeric variant="footnote" style={{ textAlign: 'center' }} testID="food-per-portion">
            {`Valores por ${draft.servingQuantity.trim() || '—'} ${unit}`}
          </AppText>
          {live.length ? (
            <View testID="food-live-errors">
              {precise ? (
                <AppText variant="footnote">Hasta 2 decimales por valor.{scaled ? ` Con ${draft.servingQuantity.trim()} ${unit} quedan muy chicos: cargalos por 100 ${unit}.` : ''}</AppText>
              ) : (
                live.map(([key, error]) => (
                  <AppText key={key} variant="footnote">{`${foodLabels[key as keyof FoodDraft]}: ${error}`}</AppText>
                ))
              )}
              {scaled ? (
                <LinkRow label={`Pasar a 100 ${unit}`} value={`${scaled.calories || '—'} kcal`} numeric onPress={() => (Object.keys(scaled) as (keyof FoodDraft)[]).forEach((key) => { if (scaled[key] !== draft[key]) controller.change(key, scaled[key]); })} testID="food-scale-100" />
              ) : null}
            </View>
          ) : null}
          {input('description')}
          {input('sourceNote')}
        </>
      ) : null}
      {Object.entries(state.errors).map(([key, error]) => (
        <AppText key={key} accessibilityRole="alert">
          {error}
        </AppText>
      ))}
      {state.message ? (
        <AppText accessibilityRole="alert">{state.message}</AppText>
      ) : null}
      {state.phase === 'conflict' ? (
        <View style={styles.section}>
          <AppText variant="headline">Datos actuales del servidor</AppText>
          {state.truth ? (
            <>
              <AppText variant="headline">{state.truth.name}</AppText>
              <Summary food={state.truth} />
              {state.truth.description ? <AppText>{state.truth.description}</AppText> : null}
              {state.truth.sourceNote ? <AppText>{`Fuente: ${state.truth.sourceNote}`}</AppText> : null}
              <Button label="Revisar mi borrador con esta versión" onPress={() => controller.reviewTruth()} />
            </>
          ) : (
            <AppText>No hay un alimento actual confirmado. Tu borrador sigue intacto.</AppText>
          )}
          <Button label="Actualizar alimento actual" onPress={() => void controller.loadTruth()} variant="quiet" />
          <Button label="Volver al catálogo" onPress={back} variant="quiet" />
        </View>
      ) : null}
      {['uncertain', 'confirmed', 'blocked'].includes(state.phase) ? (
        <Button
          label={state.intent?.receipt ? 'Actualizar catálogo confirmado' : 'Comprobar intento de catálogo'}
          onPress={() => void controller.recover()}
        />
      ) : null}
      {pending ? <LoadingState label="Guardando alimento" /> : null}
      {state.intent ? (
        <Button disabled={pending} label="Volver · conservar intento" onPress={close} variant="quiet" />
      ) : null}
    </LibrarySheet>
  );
  // Keep one native modal throughout the day picker → create → picker flow.
  return state.date || state.mode === 'register' ? (
    <Modal animationType={reduced ? 'fade' : 'slide'} presentationStyle="pageSheet" visible onRequestClose={swipeClose}
      allowSwipeDismissal={!pending && quick.state.phase !== 'pending' && !state.intent && !quick.state.intent
        && !(state.mode === 'register' && quick.controller.dirty())}>
      {state.mode === 'register' ? (
        <QuickEditor
          embedded
          controller={quick.controller}
          state={quick.state}
          onBack={() => {
            quick.controller.close();
            controller.back();
          }}
        />
      ) : state.mode === 'browse' ? (
        <FoodAddPicker controller={controller} state={state} onChoose={onChoose} onClose={close} />
      ) : (
        editor
      )}
    </Modal>
  ) : (
    editor
  );
}
