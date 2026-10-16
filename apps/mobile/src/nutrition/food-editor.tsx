import { useEffect } from 'react';
import { Alert, Modal, View } from 'react-native';
import { AppText, Button, LoadingState, useReduceMotion } from '@/design-system';
import type { PersonalFood } from '@/api/nutrition-food';
import { foodLabels, validateFoodDraft, type FoodDraft } from './food-model';
import type { FoodController, FoodState } from './food-controller';
import type { QuickController, QuickState } from './quick-controller';
import { QuickEditor } from './quick-editor';
import { FoodAddPicker } from './food-add-picker';
import { displayNutritionDate } from './day-format';
import { NutritionGlassButton } from './day-controls';
import { LibraryEditorMenu } from './library-editor-menu';
import {
  LibrarySaveButton,
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
        { text: 'Descartar', style: 'destructive', onPress: () => controller.back() },
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
  const valid = !!draft && !!validateFoodDraft(draft).fields,
    saveDisabled = locked || !valid || !controller.dirty();
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
      right={
        !browse ? (
          <View style={styles.row}>
            {state.editing ? (
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
            ) : null}
            <LibrarySaveButton
              label="Guardar alimento"
              disabled={saveDisabled}
              onPress={() => void controller.save()}
            />
          </View>
        ) : undefined
      }
      footer={
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
          <Button
            label="Actualizar catálogo"
            disabled={state.listLoading}
            onPress={() => void controller.load()}
            variant="quiet"
          />
        </>
      ) : draft ? (
        <>
          {input('name')}
          <AppText muted variant="caption">
            Valores por porción base. Vacío significa sin dato; 0 es un valor explícito.
          </AppText>
          <LibraryNutrients fields={(key, label, big) => input(key, label, big)} />
          <View style={styles.section}>
            <AppText variant="headline">Porción base</AppText>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>{input('servingQuantity')}</View>
              <View style={{ flex: 1 }}>{input('servingUnit')}</View>
            </View>
          </View>
          {input('description')}
          {input('sourceNote')}
        </>
      ) : null}
      {Object.entries(state.errors).map(([key, error]) => (
        <AppText key={key} accessibilityRole="alert">
          {error}
        </AppText>
      ))}
      {state.message && state.message !== 'Catálogo actualizado.' ? (
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
    <Modal animationType={reduced ? 'fade' : 'slide'} presentationStyle="pageSheet" visible onRequestClose={close}
      allowSwipeDismissal={!pending && quick.state.phase !== 'pending' && !state.intent && !quick.state.intent
        && !(state.mode === 'register' ? quick.controller.dirty() : controller.dirty())}>
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
