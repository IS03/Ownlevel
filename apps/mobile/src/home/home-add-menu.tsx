import { useState } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ListGroup, ListRow, SheetHandle, SheetSurface, spacing } from '@/design-system';

import type { HomeAddMenuProps } from './home-add-menu.types';
import { HomeActionSurface, HomeLink } from './home-ui';

/** Nutrition's "+ Comida" outside iOS: the M9.2 sheet with the same entries as the native menu. */
export function HomeAddMenu({ onFood, onManual, onQuick }: HomeAddMenuProps) {
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => () => { setOpen(false); action(); };
  return (
    <>
      <HomeActionSurface style={styles.control} testID="home-add-menu-glass">
        <HomeLink accessibilityLabel="Agregar comida" label="+ Comida" onPress={() => setOpen(true)} testID="home-add-menu" />
      </HomeActionSurface>
      <Modal animationType="slide" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <Pressable accessibilityLabel="Cerrar" onPress={() => setOpen(false)} style={styles.backdrop} />
        <SheetSurface>
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <SheetHandle />
            <ListGroup>
              <ListRow onPress={run(onManual)} title="A mano" />
              <ListRow onPress={run(onQuick)} title="Rápido" />
              <ListRow onPress={run(onFood)} title="Alimento por cantidad" />
            </ListGroup>
          </SafeAreaView>
        </SheetSurface>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.3)', flex: 1 },
  control: { paddingHorizontal: spacing.md },
  sheet: { gap: spacing.lg, padding: spacing.lg },
});
