import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, brandTokens, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { formatRest, parseRest } from './exercise-library-model';
import { changeRest, restWheelChoices } from './routine-editor-model';
import type { RoutineRestPickerProps } from './routine-rest-picker.types';
const HEIGHT = brandTokens.layout.inputHeight;
function Wheel({ field, ...props }: RoutineRestPickerProps & { field: 'restMin' | 'restMax' }) {
  const { colors } = useOwnlevelTheme();
  const ref = useRef<ScrollView>(null), values = restWheelChoices(props.draft, field), selected = parseRest(props.draft[field], 'Descanso');
  const selectedIndex = values.indexOf(selected);
  const moving = useRef(false), settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);
  const settle = (y: number) => { moving.current = false; const index = Math.max(0, Math.min(values.length - 1, Math.round(y / HEIGHT))); props.onChange(changeRest(props.draft, field, values[index]!)); };
  useEffect(() => { if (!moving.current) ref.current?.scrollTo({ y: selectedIndex * HEIGHT, animated: false }); }, [selectedIndex]);
  return <View style={styles.wheel}>
    <AppText muted variant="caption">{field === 'restMin' ? 'MÍNIMO' : 'MÁXIMO'}</AppText>
    <View style={styles.window}>
      <View pointerEvents="none" style={[styles.selection, { backgroundColor: colors.surfaceRaised }]} />
      <ScrollView ref={ref} scrollEnabled={!props.disabled} snapToInterval={HEIGHT} decelerationRate="fast" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: HEIGHT }} accessibilityRole="adjustable" accessibilityLabel={field === 'restMin' ? 'Descanso mínimo' : 'Descanso máximo'}
        accessibilityValue={{ text: selected === null ? 'Sin descanso' : formatRest(selected) }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={event => { if (props.disabled) return; const index = Math.max(0, Math.min(values.length - 1, selectedIndex + (event.nativeEvent.actionName === 'increment' ? 1 : -1))); props.onChange(changeRest(props.draft, field, values[index]!)); }}
        onScrollBeginDrag={() => { moving.current = true; if (settleTimer.current) clearTimeout(settleTimer.current); }}
        onScrollEndDrag={event => { const y = event.nativeEvent.contentOffset.y; settleTimer.current = setTimeout(() => settle(y), 100); }}
        onMomentumScrollBegin={() => { if (settleTimer.current) clearTimeout(settleTimer.current); }}
        onMomentumScrollEnd={event => { if (settleTimer.current) clearTimeout(settleTimer.current); settle(event.nativeEvent.contentOffset.y); }}>
        {values.map(value => <View key={value ?? 'empty'} style={styles.option}><AppText muted={value !== selected} numeric variant={value === selected ? 'title2' : 'body'}>{value === null ? 'Sin descanso' : formatRest(value)}</AppText></View>)}
      </ScrollView>
    </View>
  </View>;
}
export function RoutineRestPicker(props: RoutineRestPickerProps) { return <View style={styles.row}>{(['restMin', 'restMax'] as const).map(field => <Wheel key={field} field={field} {...props} />)}</View>; }
const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: spacing.sm }, wheel: { alignItems: 'center', flex: 1, gap: spacing.xs }, window: { height: HEIGHT * 3, width: '100%' }, option: { height: HEIGHT, alignItems: 'center', justifyContent: 'center' }, selection: { position: 'absolute', top: HEIGHT, height: HEIGHT, left: 0, right: 0, borderRadius: radius.input } });
