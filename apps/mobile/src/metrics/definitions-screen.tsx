import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useMobileApi } from '@/api';
import { useMobileAuth } from '@/auth';
import { AppText, Button, Heading, SkeletonBlock } from '@/design-system';
import { EditorialScreen, Reveal } from '@/settings/editorial';
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
        <Heading>Métricas</Heading>
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
            {read.refreshing || (state.phase === 'pending' && !editor) ? (
              <ActivityIndicator
                accessibilityLabel={
                  read.refreshing ? 'Actualizando métricas' : 'Guardando orden'
                }
                size="small"
              />
            ) : null}
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
            <Button
              label="Crear métrica"
              icon="plus"
              disabled={!editable}
              onPress={() => controller.openCreate()}
            />
            <Button
              label={
                'Archivadas · ' + archivedDefinitions(read.definitions).length
              }
              variant="quiet"
              onPress={() => setArchivedOpen(!archivedOpen)}
            />
            {archivedOpen ? (
              <View testID="metric-definitions-archived">
                <DefinitionDragList
                  definitions={archivedDefinitions(read.definitions)}
                  disabled={!editable}
                  onOpen={(d) => controller.openEdit(d)}
                  onDrop={() => {}}
                  onMove={() => {}}
                />
              </View>
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
      <Heading>Métricas</Heading>
      <SkeletonBlock height={24} />
      <SkeletonBlock height={16} />
    </EditorialScreen>
  );
}
