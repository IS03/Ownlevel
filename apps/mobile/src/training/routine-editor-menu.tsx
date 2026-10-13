import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, ListGroup, ListRow, SheetSurface, spacing } from '@/design-system';
import { RoutineSheetButton } from './routine-sheet-button';
export function RoutineEditorMenu({ disabled, active, onIdentity, onDuplicate, onStatus }: { disabled: boolean; active: boolean; onIdentity: () => void; onDuplicate: () => void; onStatus: () => void }) {
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => () => { setOpen(false); if (!disabled) action(); };
  return <><RoutineSheetButton label="Opciones de rutina" icon="more" disabled={disabled} onPress={() => setOpen(true)} />
    <Modal transparent animationType="fade" visible={open && !disabled} onRequestClose={() => setOpen(false)}>
      <View style={styles.root}><Pressable accessibilityLabel="Cerrar opciones de rutina" accessibilityRole="button" onPress={() => setOpen(false)} style={[StyleSheet.absoluteFill, styles.backdrop]} />
        <SheetSurface style={styles.sheet}><SafeAreaView edges={['bottom']}><AppText variant="headline">Opciones de rutina</AppText><ListGroup>
          <ListRow title="Cambiar nombre y color" onPress={run(onIdentity)} chevron={false} />
          <ListRow title="Duplicar rutina" onPress={run(onDuplicate)} chevron={false} />
          <ListRow title={active ? 'Archivar rutina' : 'Restaurar'} onPress={run(onStatus)} chevron={false} />
          <ListRow title="Cancelar" onPress={() => setOpen(false)} chevron={false} />
        </ListGroup></SafeAreaView></SheetSurface>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({ root: { flex: 1, justifyContent: 'flex-end' }, backdrop: { backgroundColor: 'rgba(0,0,0,0.35)' }, sheet: { padding: spacing.lg } });
