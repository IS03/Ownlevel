import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { AppText, ListGroup, ListRow, SheetSurface } from '@/design-system';
export type ExerciseChoiceProps = { title: string; value: string; options: { value: string; label: string }[]; disabled: boolean; onChange: (value: string) => void };
export function ExerciseChoiceMenu({ title, value, options, disabled, onChange }: ExerciseChoiceProps) {
  const [open, setOpen] = useState(false);
  return <><ListRow title={title} value={options.find(option => option.value === value)?.label ?? value} disabled={disabled} onPress={() => setOpen(true)} />
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' }}><SheetSurface><ScrollView style={{ maxHeight: 500 }}>
        <AppText variant="headline">{title}</AppText><ListGroup>{options.map(option => <ListRow key={option.value} title={option.label} icon={value === option.value ? 'checkmark' : undefined} chevron={false}
          onPress={() => { setOpen(false); onChange(option.value); }} />)}</ListGroup><ListRow title="Cancelar" onPress={() => setOpen(false)} /></ScrollView></SheetSurface></View>
    </Modal></>;
}
