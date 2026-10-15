import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppText, Button, GlassSurface, LoadingState, useOwnlevelTheme } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import type { PersonalSavedMeal } from '@/api/nutrition-saved';
import type { SavedController, SavedState } from './saved-controller';
import {
  draftTotals,
  ingredientBase,
  ingredientLabel,
  ingredientUnit,
  savedLabels,
  savedNumber,
  validateSavedDraft,
} from './saved-model';
import { scaleSavedNutrients } from '../../../../src/lib/mobile-api/saved-meal-math';
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
  libraryStyles as shared,
  useLibraryNotice,
} from './library-ui';
import { mealShown } from './meal-sheet';
function Nutrition({
  calories,
  proteinG,
  carbsG,
  fatG,
}: {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}) {
  return (
    <View style={shared.row}>
      <AppText numeric variant="title1">
        {mealShown(calories)} kcal
      </AppText>
      <AppText muted numeric>
        {libraryMacros({ proteinG, carbsG, fatG })}
      </AppText>
    </View>
  );
}
export function SavedEditor({ controller, state }: { controller: SavedController; state: SavedState }) {
  const { colors } = useOwnlevelTheme(),
    notice = useLibraryNotice(controller);
  const [picker, setPicker] = useState(false),
    [search, setSearch] = useState('');
  const [wasOpen, setWasOpen] = useState(state.open);
  if (wasOpen !== state.open) {
    setWasOpen(state.open);
    if (!state.open) {
      setPicker(false);
      setSearch('');
    }
  }
  if (!state.open) return null;
  const pending = state.phase === 'pending' || state.phase === 'loading',
    locked = state.phase !== 'idle' || !!state.intent,
    d = state.draft;
  const discard = (action: () => void) =>
    controller.dirty() && !state.intent
      ? Alert.alert('¿Descartar cambios?', 'Estos cambios de la comida guardada no están guardados.', [
          { text: 'Seguir editando', style: 'cancel' },
          { text: 'Descartar', style: 'destructive', onPress: action },
        ])
      : action();
  const close = () => {
    if (!pending)
      discard(() => {
        setPicker(false);
        controller.close();
      });
  };
  const back = () => {
    if (pending) return;
    if (picker) setPicker(false);
    else if (state.intent || state.phase === 'blocked') close();
    else discard(() => controller.back());
  };
  const action = (op: 'archive' | 'reactivate' | 'delete', meal: PersonalSavedMeal | null = state.editing) => {
    if (!meal || locked) return;
    Alert.alert(
      op === 'delete'
        ? '¿Eliminar comida guardada?'
        : op === 'archive'
          ? '¿Archivar comida guardada?'
          : '¿Restaurar comida guardada?',
      `Las comidas ya registradas no cambian.${controller.dirty() ? ' Los cambios sin guardar se descartarán.' : ''}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: op === 'delete' ? 'Eliminar' : op === 'archive' ? 'Archivar' : 'Restaurar',
          style: op === 'delete' ? 'destructive' : 'default',
          onPress: () => {
            if (state.mode === 'browse') controller.begin(meal);
            void controller.save(op);
          },
        },
      ],
    );
  };
  const input = (key: keyof typeof savedLabels, label = savedLabels[key], big = false) => (
    <LibraryField
      label={label}
      value={d![key]}
      disabled={locked}
      big={big}
      numeric={['calories', 'proteinG', 'carbsG', 'fatG'].includes(key)}
      multiline={key === 'description'}
      placeholder={
        key === 'name' ? 'Nombre de la comida' : key === 'description' ? 'Descripción (opcional)' : undefined
      }
      onChange={(v) => controller.change(key, v)}
    />
  );
  const totals = d && draftTotals(d),
    browse = state.mode === 'browse' && !picker;
  const saveDisabled = locked || !d || !validateSavedDraft(d).fields || !controller.dirty();
  const searchable = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toUpperCase();
  const matches = state.pickerFoods?.filter((f) => searchable(f.name).includes(searchable(search.trim())));
  const create = () =>
    Alert.alert('Nueva comida', 'Elegí cómo querés guardarla.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'A mano', onPress: () => controller.begin(undefined, 'manual') },
      { text: 'Con ingredientes', onPress: () => controller.begin(undefined, 'composite') },
    ]);
  return (
    <LibrarySheet
      title={
        picker
          ? 'Agregar ingrediente'
          : browse
            ? 'Comidas guardadas'
            : state.mode === 'create'
              ? 'Nueva comida'
              : 'Editar comida guardada'
      }
      browse={browse}
      testID="saved-editor"
      running={pending}
      onClose={browse ? close : back}
      right={
        !browse && !picker ? (
          <View style={shared.row}>
            {state.editing ? (
              <LibraryEditorMenu
                disabled={locked}
                actions={[
                  {
                    label: state.editing.isActive ? 'Archivar' : 'Restaurar',
                    symbol: 'archivebox',
                    onPress: () => action(state.editing!.isActive ? 'archive' : 'reactivate'),
                  },
                  {
                    label: 'Eliminar comida guardada',
                    symbol: 'trash',
                    destructive: true,
                    onPress: () => action('delete'),
                  },
                ]}
              />
            ) : null}
            <LibrarySaveButton label="Guardar comida" disabled={saveDisabled} onPress={() => void controller.save()} />
          </View>
        ) : undefined
      }
      footer={
        <>
          {notice.notice}
          {!browse && !picker && d ? (
            <Button
              label={pending ? 'Guardando…' : 'Guardar'}
              disabled={saveDisabled}
              onPress={() => void controller.save()}
            />
          ) : null}
        </>
      }
    >
      {picker ? (
        <>
          <LibrarySearch label="Buscar alimento" value={search} onChange={setSearch} />
          {state.pickerLoading ? <LoadingState label="Cargando alimentos" /> : null}
          {state.pickerError || (state.pickerFoods === null && !state.pickerLoading) ? (
            <>
              <AppText>No hay una lectura confirmada de alimentos.</AppText>
              <Button label="Cargar alimentos" onPress={() => void controller.loadFoods()} />
            </>
          ) : null}
          <View>
            {matches?.map((f) => (
              <LibraryRow
                key={f.id}
                name={f.name}
                actionLabel="Elegir"
                calories={f.calories}
                detail={`${mealShown(f.servingQuantity, 3)} ${f.servingUnit} · ${libraryMacros(f)}`}
                disabled={
                  locked ||
                  state.pickerLoading ||
                  state.pickerError ||
                  d?.items.some((i) => (i.food?.id ?? i.snapshot?.sourceFoodId) === f.id)
                }
                onOpen={() => {
                  controller.addIngredient(f);
                  setPicker(false);
                }}
                actions={[]}
              />
            ))}
          </View>
          {state.pickerFoods?.length === 0 && !state.pickerError && !state.pickerLoading ? (
            <AppText muted>No tenés alimentos activos. Creá uno desde Alimentos.</AppText>
          ) : null}
          {state.pickerFoods?.length && matches?.length === 0 && !state.pickerError ? (
            <AppText muted>No encontramos alimentos con esa búsqueda.</AppText>
          ) : null}
        </>
      ) : browse ? (
        <>
          <LibrarySearch label="Buscar guardada" value={state.search} onChange={(v) => controller.query(v)} />
          <LibraryFilter filter={state.filter} onChange={(f) => controller.setFilter(f)} />
          <NutritionGlassButton wide icon="plus" label="Nueva comida" onPress={locked ? undefined : create} />
          {state.listLoading ? <LoadingState label="Cargando guardadas" /> : null}
          {state.listError ? (
            <View style={shared.section}>
              <AppText accessibilityRole="alert">
                No pudimos actualizar las guardadas. {state.meals ? 'Mostramos la última lectura.' : ''}
              </AppText>
              <Button label="Reintentar guardadas" onPress={() => void controller.load()} variant="quiet" />
            </View>
          ) : null}
          {state.meals?.length === 0 && !state.listError && !state.listLoading ? (
            <AppText muted>
              {state.search
                ? 'Sin resultados para esa búsqueda.'
                : state.filter === 'archived'
                  ? 'No tenés comidas archivadas.'
                  : 'Todavía no guardaste comidas. Guardalas desde una comida del día o creá una acá.'}
            </AppText>
          ) : null}
          <View>
            {state.meals?.map((m) => (
              <LibraryRow
                key={m.id}
                testID={`library-saved-${m.id}`}
                name={m.name}
                calories={m.calories}
                detail={`${libraryMacros(m)}${m.templateType === 'composite' ? ` · ${m.items.length} ${m.items.length === 1 ? 'ingrediente' : 'ingredientes'}` : ''}`}
                active={m.isActive}
                highlighted={notice.highlighted === m.id}
                disabled={locked || state.listError || state.listLoading}
                onOpen={() => controller.begin(m)}
                onArchive={() => action(m.isActive ? 'archive' : 'reactivate', m)}
              />
            ))}
          </View>
          <Button
            label="Actualizar guardadas"
            onPress={() => void controller.load()}
            disabled={state.listLoading}
            variant="quiet"
          />
        </>
      ) : d ? (
        <>
          {input('name')}
          {d.templateType === 'manual' ? (
            <>
              <LibraryNutrients fields={(key, label, big) => input(key, label, big)} />
              <AppText muted variant="caption">
                Vacío significa sin dato; 0 es un valor explícito.
              </AppText>
            </>
          ) : (
            <>
              <AppText muted variant="caption">
                Los valores de cada ingrediente se conservan como los guardaste. Cantidades de hasta 2 decimales.
              </AppText>
              <View>
                {d.items.map((item, index) => {
                  const label = ingredientLabel(item),
                    base = ingredientBase(item),
                    unit = ingredientUnit(item),
                    q = savedNumber(item.quantity),
                    step = ['g', 'ml'].includes(unit.toLowerCase())
                      ? 10
                      : Math.max(0.01, Math.min(1, Math.round(base.baseQuantity * 100) / 100));
                  const values = q != null && q > 0 && q <= 1000000 ? scaleSavedNutrients(base, q) : null;
                  const change = (delta: number) => {
                    if (!locked && q !== undefined) {
                      const next = Math.round(((q ?? 0) + delta * step) * 100) / 100;
                      if (next > 0 && next <= 1000000) {
                        triggerHaptic('stepperChange');
                        controller.quantity(index, String(next).replace('.', ','));
                      }
                    }
                  };
                  return (
                    <View
                      key={`${item.snapshot?.id ?? item.food?.id}:${index}`}
                      style={[shared.flat, { borderColor: colors.border }]}
                    >
                      <View style={shared.row}>
                        <View style={{ flex: 1 }}>
                          <AppText variant="headline">{label}</AppText>
                          <AppText muted numeric variant="caption">
                            {mealShown(values?.calories)} kcal · {unit}
                          </AppText>
                        </View>
                        <GlassSurface style={styles.stepper}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Restar ${label}`}
                            disabled={locked || q == null || q <= step}
                            onPress={() => change(-1)}
                            style={styles.step}
                          >
                            <AppText>−</AppText>
                          </Pressable>
                          <TextInput
                            accessibilityLabel={`Cantidad ${index + 1}`}
                            value={item.quantity}
                            editable={!locked}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                            placeholder="—"
                            placeholderTextColor={colors.textMuted}
                            onChangeText={(v) => controller.quantity(index, v)}
                            style={[styles.quantity, { color: colors.text }]}
                          />
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Sumar ${label}`}
                            disabled={locked || q === undefined || (q ?? 0) + step > 1000000}
                            onPress={() => change(1)}
                            style={styles.step}
                          >
                            <AppText>+</AppText>
                          </Pressable>
                        </GlassSurface>
                      </View>
                      <LibraryEditorMenu
                        label={`Acciones de ${label}`}
                        disabled={locked}
                        actions={[
                          ...(index > 0
                            ? [
                                {
                                  label: 'Subir ingrediente',
                                  symbol: 'arrow.2.squarepath' as const,
                                  onPress: () => controller.moveIngredient(index, -1),
                                },
                              ]
                            : []),
                          ...(index < d.items.length - 1
                            ? [
                                {
                                  label: 'Bajar ingrediente',
                                  symbol: 'arrow.2.squarepath' as const,
                                  onPress: () => controller.moveIngredient(index, 1),
                                },
                              ]
                            : []),
                          {
                            label: 'Quitar ingrediente',
                            symbol: 'trash',
                            onPress: () => controller.removeIngredient(index),
                          },
                        ]}
                      />
                    </View>
                  );
                })}
              </View>
              <NutritionGlassButton
                wide
                icon="plus"
                label="Agregar ingrediente"
                onPress={
                  locked || d.items.length >= 50
                    ? undefined
                    : () => {
                        setSearch('');
                        setPicker(true);
                        void controller.loadFoods();
                      }
                }
              />
              {totals ? (
                <Nutrition {...totals} />
              ) : (
                <AppText muted>Completá cantidades válidas para ver el total.</AppText>
              )}
            </>
          )}
          {input('description')}
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
        <View style={shared.section}>
          <AppText variant="headline">Revisar conflicto</AppText>
          {state.truth ? (
            <>
              <AppText>{state.truth.name}</AppText>
              <Nutrition {...state.truth} />
              <Button label="Revisar borrador con versión actual" onPress={() => controller.reviewTruth()} />
              <Button
                label="Adoptar ingredientes actuales"
                variant="secondary"
                onPress={() =>
                  Alert.alert(
                    '¿Usar ingredientes actuales?',
                    'Reemplaza los ingredientes y cantidades del borrador. Conserva nombre y descripción.',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Usar actuales', onPress: () => controller.adoptServerIngredients() },
                    ],
                  )
                }
              />
            </>
          ) : null}
          <Button label="Revisar alimentos elegidos" onPress={() => controller.reviewFoods()} variant="secondary" />
          <Button
            label="Actualizar versión del servidor"
            onPress={() => void controller.loadTruth()}
            variant="secondary"
          />
          <Button label="Cancelar edición" onPress={() => discard(() => controller.back())} variant="quiet" />
        </View>
      ) : null}
      {['uncertain', 'confirmed', 'blocked'].includes(state.phase) ? (
        <Button
          label={state.intent?.receipt ? 'Actualizar catálogo confirmado' : 'Comprobar intento guardado'}
          onPress={() => void controller.recover()}
        />
      ) : null}
      {pending ? <LoadingState label="Guardando comida" /> : null}
      {state.intent ? (
        <Button label="Cerrar · conservar intento" variant="quiet" disabled={pending} onPress={close} />
      ) : null}
    </LibrarySheet>
  );
}
const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, overflow: 'hidden' },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  quantity: {
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    minWidth: 44,
    maxWidth: 80,
    textAlign: 'center',
    minHeight: 44,
  },
});
