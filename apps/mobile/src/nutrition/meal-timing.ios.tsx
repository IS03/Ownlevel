import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Button as NativeButton, DatePicker, HStack, Host, Image, Menu, Text } from '@expo/ui/swift-ui';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { accessibilityLabel, datePickerStyle, disabled as nativeDisabled, font, foregroundStyle, glassEffect, padding, tint } from '@expo/ui/swift-ui/modifiers';
import { AppText, Button, GlassSurface, SheetHandle, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { mealMoments, type MealTimingProps } from './meal-timing-model';
export function MealTiming({ date, value, disabled, onChange }: MealTimingProps) {
  const { colors, isDark } = useOwnlevelTheme(), reduced = useReduceMotion();
  const [clockOpen, setClockOpen] = useState(false);
  const [clock, setClock] = useState(new Date());
  const shown = value.consumedAt ? new Date(Date.parse(value.consumedAt) - 10800000).toISOString().slice(11,16) : null;
  const openClock = () => {
    const now = new Date(Date.now() - 10800000).toISOString().slice(11,16);
    // DatePicker uses the device's zone. Present the domain clock as local components.
    setClock(new Date(`${date}T${shown ?? now}:00`)); setClockOpen(true);
  };
  return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <AppText muted>Momento</AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Host matchContents colorScheme={isDark ? 'dark' : 'light'}>
          <Menu label={<HStack spacing={6} modifiers={[padding({ all: 12 }), glassEffect({ glass: { variant: 'regular' }, shape: 'capsule' })]}>
            <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' }), foregroundStyle(colors.text)]}>{value.mealLabel ? mealMoments[value.mealLabel] : 'Sin momento'}</Text>
            <Image systemName="chevron.up.chevron.down" size={11} color={colors.textMuted} />
          </HStack>} modifiers={[accessibilityLabel('Elegir momento'), nativeDisabled(disabled)]}>
            <NativeButton label="Sin momento" onPress={() => onChange(null, value.consumedAt)} />
            {Object.entries(mealMoments).map(([key, label]) => <NativeButton key={key} label={label} onPress={() => onChange(key as keyof typeof mealMoments, value.consumedAt)} />)}
          </Menu>
        </Host>
        <Pressable accessibilityRole="button" accessibilityLabel={shown ? `Cambiar hora ${shown}` : 'Elegir hora opcional'} disabled={disabled} onPress={openClock}>
          <GlassSurface interactive style={{ minHeight: 44, borderRadius: 22, paddingHorizontal: 12, justifyContent: 'center' }}><AppText numeric variant="footnote">{shown ?? 'Hora'}</AppText></GlassSurface>
        </Pressable>
      </View>
    </View>
    {clockOpen ? <Modal visible transparent animationType="fade" onRequestClose={() => setClockOpen(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'flex-end' }}>
        <Animated.View entering={reduced ? FadeIn.duration(200) : SlideInDown.duration(300)} style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 40, gap: 16 }} accessibilityViewIsModal>
          <SheetHandle /><AppText variant="headline">Hora de la comida</AppText>
          <Host colorScheme={isDark ? 'dark' : 'light'} style={{ height: 200, width: '100%' }}><DatePicker title="Hora" selection={clock} displayedComponents={['hourAndMinute']} modifiers={[datePickerStyle('wheel'), tint(colors.primary)]} onDateChange={setClock} /></Host>
          <Button label="Elegir esta hora" onPress={() => { onChange(value.mealLabel ?? null, `${date}T${String(clock.getHours()).padStart(2,'0')}:${String(clock.getMinutes()).padStart(2,'0')}:00-03:00`); setClockOpen(false); }} />
          <Button label="Cancelar" variant="quiet" onPress={() => setClockOpen(false)} />
        </Animated.View>
      </View>
    </Modal> : null}
  </View>;
}
