import { cloneElement, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, ListGroup, ListRow, SheetHandle, SheetSurface, spacing } from '@/design-system';
import type { RoutineContextMenuProps } from './routine-context-menu.types';

/** RN action sheet, as in HomeAddMenu: Android Alert only supports three buttons. */
export function RoutineContextMenu({ children, disabled, routine, onStart, onEdit, onColor, onStatus }: RoutineContextMenuProps) {
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => () => { setOpen(false); if (!disabled) action(); };
  return <>
    {cloneElement(children, { onLongPress: () => { if (!disabled) setOpen(true); } })}
    <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible={open && !disabled}>
      <View style={styles.modal}>
        <Pressable accessibilityLabel="Cerrar acciones" accessibilityRole="button" onPress={() => setOpen(false)} style={[StyleSheet.absoluteFill, styles.backdrop]} />
        <SheetSurface style={styles.sheet} testID="routine-menu">
          <SafeAreaView edges={['bottom']}>
            <ScrollView contentContainerStyle={styles.content}>
              <SheetHandle />
              <AppText accessibilityRole="header" variant="headline">{routine.name}</AppText>
              <ListGroup>
                {routine.isActive ? <ListRow chevron={false} onPress={run(onStart)} title="Empezar entrenamiento" /> : null}
                <ListRow chevron={false} onPress={run(onEdit)} title="Editar rutina" />
                {routine.isActive ? <ListRow chevron={false} onPress={run(onColor)} title="Cambiar color" /> : null}
              </ListGroup>
              <ListGroup><ListRow chevron={false} icon="archive" onPress={run(onStatus)} title={routine.isActive ? 'Archivar' : 'Restaurar'} /></ListGroup>
              <ListRow chevron={false} onPress={() => setOpen(false)} title="Cancelar" />
            </ScrollView>
          </SafeAreaView>
        </SheetSurface>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.35)' },
  content: { gap: spacing.md },
  modal: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%' },
});
