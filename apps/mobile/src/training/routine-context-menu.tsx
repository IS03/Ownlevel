import { cloneElement, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, ListGroup, ListRow, SheetHandle, SheetSurface, spacing } from '@/design-system';
import { routineMenuActions, type RoutineContextMenuProps, type TrainingContextMenuProps } from './routine-context-menu.types';
export function TrainingContextMenu({ children, disabled, name, actions, openOnTap }: TrainingContextMenuProps) {
  const [open, setOpen] = useState(false);
  return <>{cloneElement(children, { onLongPress: () => { if (!disabled) setOpen(true); }, ...(openOnTap ? { onPress: () => { if (!disabled) setOpen(true); } } : {}) })}
    <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible={open && !disabled}><View style={styles.modal}>
      <Pressable accessibilityLabel="Cerrar acciones" accessibilityRole="button" onPress={() => setOpen(false)} style={[StyleSheet.absoluteFill, styles.backdrop]} />
      <SheetSurface style={styles.sheet} testID="routine-menu"><SafeAreaView edges={['bottom']}><ScrollView contentContainerStyle={styles.content}>
        <SheetHandle /><AppText accessibilityRole="header" variant="headline">{name}</AppText><ListGroup>{actions.map(action => <ListRow key={action.label} chevron={false} title={action.label}
          onPress={() => { setOpen(false); if (!disabled) action.onPress(); }} />)}</ListGroup><ListRow chevron={false} title="Cancelar" onPress={() => setOpen(false)} />
      </ScrollView></SafeAreaView></SheetSurface>
    </View></Modal></>;
}
export function RoutineContextMenu(props: RoutineContextMenuProps) { return <TrainingContextMenu {...props} name={props.routine.name} onOpen={props.onEdit} actions={routineMenuActions(props)} />; }
const styles = StyleSheet.create({ backdrop: { backgroundColor: 'rgba(0,0,0,0.35)' }, content: { gap: spacing.md }, modal: { flex: 1, justifyContent: 'flex-end' }, sheet: { maxHeight: '85%' } });
