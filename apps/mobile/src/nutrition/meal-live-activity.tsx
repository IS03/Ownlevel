import { Button, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { activityBackgroundTint, buttonStyle, controlSize, font, foregroundStyle, lineLimit, padding, tint } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';
import type { MealActivityProps } from './meal-activity-model';

/**
 * #645 · A meal left without saving or discarding. Runs inside the widget extension as text (the 'widget' directive): only
 * props and SwiftUI. Tapping it opens the meal where it was left («Continuar»); «Descartar» (target MEAL_DISCARD) drops
 * only this device's draft, with nothing written. Same dark look as the workout activity.
 */
function mealLayout(props: MealActivityProps, environment: LiveActivityEnvironment) {
  'widget';
  const { accent, text, muted, background } = props.colors;
  const old = environment.isStale === true || props.until <= Date.now();
  const what = props.kind === 'plate' ? 'Plato sin terminar' : 'Comida sin terminar';
  const line = [props.title, props.detail, props.day].filter(Boolean).join(' · ');
  function icon(color: string) { return <Image systemName="fork.knife" color={color} />; }
  function discard() {
    return <Button label="Descartar" systemImage="xmark" target="meal:discard" modifiers={[buttonStyle('bordered'), tint(accent), controlSize('small')]} />;
  }
  return {
    banner: (
      <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 16 }), activityBackgroundTint(background)]}>
        <HStack spacing={8}>
          {icon(accent)}
          <VStack alignment="leading" spacing={4}>
            <Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle(text), lineLimit(1)]}>{what}</Text>
            <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle(muted), lineLimit(1)]}>{line}</Text>
          </VStack>
          <Spacer />
        </HStack>
        <HStack spacing={8}>
          <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(old ? muted : accent)]}>{old ? 'Sigue en la app' : 'Tocá para seguir'}</Text>
          <Spacer />
          {discard()}
        </HStack>
      </VStack>
    ),
    compactLeading: icon(accent),
    compactTrailing: <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(muted)]}>{props.kind === 'plate' ? 'Plato' : 'Comida'}</Text>,
    minimal: icon(accent),
    expandedLeading: (
      <VStack alignment="leading" spacing={4}>
        {icon(accent)}
        <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(muted)]}>Sin terminar</Text>
      </VStack>
    ),
    expandedBottom: (
      <VStack alignment="leading" spacing={8}>
        <Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle(text), lineLimit(1)]}>{what}</Text>
        <HStack spacing={8}>
          <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle(muted), lineLimit(1)]}>{line}</Text>
          <Spacer />
          {discard()}
        </HStack>
      </VStack>
    ),
  };
}

export function mealActivities() {
  return createLiveActivity<MealActivityProps>('OwnlevelMeal', mealLayout);
}
