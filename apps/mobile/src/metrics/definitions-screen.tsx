import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMobileApi } from '@/api';
import { useMobileAuth } from '@/auth';
import { AppIcon, AppText, Button, SkeletonBlock, brandTokens, pressedStyle, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { NutritionGlassButton } from '@/nutrition/day-controls';
import { EditorialExpansion, EditorialMove, EditorialScreen, Reveal, ScreenTitle } from '@/settings/editorial';
import { NutritionToast } from '@/nutrition/nutrition-toast';
import type {
  DefinitionsController,
  DefinitionsState,
} from './definitions-controller';
import { DefinitionEditorSheet } from './definitions-editor';
import { activeDefinitions, archivedDefinitions } from './definitions-model';
import { DefinitionDragList } from './definition-drag-list';
import { useDefinitionsController } from './use-definitions-controller';
import type { DefinitionEditor } from './definitions-storage';
export function DefinitionsView({
  state,
  controller,
}: {
  state: DefinitionsState;
  controller: DefinitionsController;
}) {
  const { read, editor } = state;
  const [archivedOpen, setArchivedOpen] = useState(false),
    [last, setLast] = useState<DefinitionEditor | null>(editor),
    [dragging, setDragging] = useState(false);
  if (editor && editor !== last) setLast(editor);
  useEffect(() => {
    if (state.notice) {
      const t = setTimeout(() => controller.dismissNotice(), 2400);
      return () => clearTimeout(t);
    }
  }, [state.notice, controller]);
  const editable = state.phase === 'idle' && !state.intent && !editor;
  const shown = editor ?? (state.notice ? last : null);
  return (
    <View style={{ flex: 1 }}>
      <EditorialScreen scrollEnabled={!dragging}>
        <ScreenTitle>Métricas</ScreenTitle>
        <AppText muted>
          Lo que querés registrar cada día. Aparecen en Inicio y en Nutrición,
          en este orden.
        </AppText>
        {!read.definitions ? (
          read.status === 'loading' ? (
            <View testID="metric-definitions-loading" style={{ gap: 24 }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={{ gap: 8 }}>
                  <SkeletonBlock height={24} width="60%" />
                  <SkeletonBlock height={16} width="85%" />
                </View>
              ))}
            </View>
          ) : (
            <View testID="metric-definitions-unavailable">
              <AppText>No pudimos cargar tus métricas.</AppText>
              <Button
                label="Reintentar"
                onPress={() => void controller.load()}
              />
            </View>
          )
        ) : (
          <>
            {state.phase === 'pending' && !editor ? <ActivityIndicator accessibilityLabel="Guardando orden" size="small" /> : null}
            {read.stale ? (
              <View>
                <AppText muted>
                  Mostramos lo último que teníamos. No pudimos actualizarlo.
                </AppText>
                <Button
                  label="Reintentar"
                  onPress={() => void controller.load()}
                />
              </View>
            ) : null}
            <Reveal>
              <View testID="metric-definitions-active">
                <DefinitionDragList
                  definitions={activeDefinitions(read.definitions)}
                  disabled={!editable}
                  onDragging={setDragging}
                  onOpen={(d) => controller.openEdit(d)}
                  onDrop={(ids, expected) =>
                    void controller.reorder(ids, expected)
                  }
                  onMove={(id, direction) =>
                    void controller.move(id, direction)
                  }
                />
                {!activeDefinitions(read.definitions).length ? (
                  <AppText muted>No tenés métricas activas.</AppText>
                ) : null}
              </View>
            </Reveal>
            {activeDefinitions(read.definitions).length > 1 ? (
              <AppText muted variant="footnote" style={{ marginTop: -12 }}>
                Mantené apretada una métrica y arrastrala para cambiar el orden.
              </AppText>
            ) : null}
            {/* The same wide glass action as «Agregar comida» and «Nueva comida». */}
            <NutritionGlassButton
              wide
              icon="plus"
              label="Crear métrica"
              onPress={editable ? () => controller.openCreate() : undefined}
            />
            {archivedDefinitions(read.definitions).length ? (
              <EditorialMove>
                <ArchivedRow
                  count={archivedDefinitions(read.definitions).length}
                  open={archivedOpen}
                  onPress={() => setArchivedOpen(!archivedOpen)}
                />
                {archivedOpen ? (
                  <EditorialExpansion testID="metric-definitions-archived">
                    <AppText muted variant="footnote">
                      No aparecen en Inicio ni en Nutrición. Tocá una para restaurarla.
                    </AppText>
                    <DefinitionDragList
                      definitions={archivedDefinitions(read.definitions)}
                      disabled={!editable}
                      onOpen={(d) => controller.openEdit(d)}
                      onDrop={() => {}}
                      onMove={() => {}}
                    />
                  </EditorialExpansion>
                ) : null}
              </EditorialMove>
            ) : null}
          </>
        )}
        {state.message && !editor ? (
          <AppText accessibilityLiveRegion="polite">{state.message}</AppText>
        ) : null}
        {!editor &&
        ['uncertain', 'confirmed', 'blocked'].includes(state.phase) ? (
          <Button
            label="Comprobar cambio"
            onPress={() => void controller.recover()}
          />
        ) : null}
      </EditorialScreen>
      {state.notice ? (
        <NutritionToast message={state.notice} state="done" />
      ) : null}
      {shown ? (
        <DefinitionEditorSheet
          editor={shown}
          state={state}
          controller={controller}
          onClosed={() => setLast(null)}
        />
      ) : null}
    </View>
  );
}
/** «Archivadas» as a row of the list, not a loose button: icon, count, and a chevron that turns as it opens. */
function ArchivedRow({ count, open, onPress }: { count: number; open: boolean; onPress: () => void }) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  const angle = useSharedValue(open ? 90 : 0);
  useEffect(() => { angle.set(reduced ? (open ? 90 : 0) : withTiming(open ? 90 : 0, { duration: brandTokens.motion.duration.fast })); }, [angle, open, reduced]);
  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Archivadas, ${count}`}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      testID="metric-definitions-archived-toggle"
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: open ? 0 : StyleSheet.hairlineWidth, borderColor: colors.border }, pressedStyle(pressed, reduced)]}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
        <AppIcon name="archive" size={20} color={colors.textMuted} />
      </View>
      <AppText variant="body" style={{ flex: 1 }}>Archivadas</AppText>
      <AppText muted numeric variant="subheadline">{count}</AppText>
      <Animated.View style={turn}><AppIcon name="chevronRight" size={15} color={colors.textMuted} /></Animated.View>
    </Pressable>
  );
}
export function MetricDefinitionsScreen() {
  const { session } = useMobileAuth(),
    userId = session?.user.id ?? 'anonymous';
  return <UserDefinitions key={userId} userId={userId} />;
}
function UserDefinitions({ userId }: { userId: string }) {
  const { client } = useMobileApi(),
    shared = useDefinitionsController(client, userId);
  return shared ? (
    <DefinitionsView {...shared} />
  ) : (
    <EditorialScreen>
      <ScreenTitle>Métricas</ScreenTitle>
      <SkeletonBlock height={24} />
      <SkeletonBlock height={16} />
    </EditorialScreen>
  );
}
