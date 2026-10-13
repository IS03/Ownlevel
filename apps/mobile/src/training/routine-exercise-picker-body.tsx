import { ScrollView, StyleSheet, View } from 'react-native';
import { AppIcon, AppText, Chip, ListGroup, ListRow, TextField, spacing, useOwnlevelTheme } from '@/design-system';
import { MUSCLE_GROUP_OPTIONS, exerciseSummary } from './exercise-library-model';
import type { RoutineExercisePickerBodyProps } from './routine-exercise-picker-body.types';
export function RoutineExercisePickerBody(props: RoutineExercisePickerBodyProps) {
  const { colors } = useOwnlevelTheme();
  return <View style={styles.root}>
    <TextField label="Buscar ejercicio" hideLabel search disabled={props.disabled} placeholder="Buscar ejercicio" value={props.query} onChangeText={props.onQuery} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}><View style={{ flexDirection: 'row', gap: spacing.sm }}>
      {[{ value: null, label: 'Todos' }, ...MUSCLE_GROUP_OPTIONS].map(option => <Chip key={option.value ?? 'all'} label={option.label} selected={props.group === option.value} onPress={() => props.onGroup(option.value)} disabled={props.disabled} />)}
    </View></ScrollView>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.lg }}>
      <ListGroup bordered={false}>
        {props.session && props.canCreate ? <ListRow title={props.query.trim() ? `Crear “${props.query.trim()}”` : 'Crear ejercicio nuevo'} icon="plus" onPress={props.onCreate} disabled={props.disabled} /> : null}
        {props.rows.map(exercise => <ListRow key={exercise.id} title={exercise.name} subtitle={exerciseSummary(exercise) ?? undefined} chevron={false}
          accessibilityLabel={`${exercise.name}${props.existing.has(exercise.id) ? `, En la ${props.session ? 'sesión' : 'rutina'}` : props.selected.includes(exercise.id) ? ', seleccionado' : ''}`}
          disabled={props.disabled || props.existing.has(exercise.id)} onPress={() => props.onToggle(exercise.id)}
          trailing={props.existing.has(exercise.id) ? <AppText muted variant="footnote">{props.session ? 'En la sesión' : 'En la rutina'}</AppText> : props.selected.includes(exercise.id) ? <AppIcon name="check" size={20} color={colors.primary} /> : props.session ? <AppIcon name="plus" size={20} color={colors.primary} /> : null} />)}
        {props.rows.length === 0 ? !props.canCreate ? <ListRow title="Actualizá la biblioteca para continuar." /> : !props.session && props.query.trim() ? <ListRow title={`Crear “${props.query.trim()}”`} icon="plus" onPress={props.onCreate} disabled={props.disabled} /> : <ListRow title="No hay ejercicios disponibles" /> : null}
      </ListGroup>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({ root: { flex: 1, gap: spacing.sm, paddingHorizontal: spacing.lg }, chips: { flexGrow: 0 } });
