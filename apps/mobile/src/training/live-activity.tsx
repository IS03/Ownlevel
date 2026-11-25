import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { activityBackgroundTint, font, foregroundStyle, frame, labelsHidden, lineLimit, monospacedDigit, multilineTextAlignment, padding, tint } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';
import type { LiveActivityProps } from './live-activity-model';

/**
 * Runs inside the widget extension: the 'widget' directive turns this function into text, so it can only use its
 * props and the SwiftUI components the extension exposes. iOS draws every countdown; no app code runs each second.
 * staleDate is the rest's end, so a rest that ends while the app is suspended reads «Descanso terminado».
 * One dark look on the Lock Screen and the Dynamic Island (see LiveActivityColors).
 */
function workoutLayout(props: LiveActivityProps, environment: LiveActivityEnvironment) {
  'widget';
  const { accent, text, muted, background } = props.colors;
  const rest = props.rest;
  const ended = !!rest && (environment.isStale === true || rest.endAt <= Date.now());
  const counting = !!rest && !ended;
  const interval = rest ? { lower: new Date(rest.startedAt), upper: new Date(rest.endAt) } : null;
  const status = counting ? 'Descanso' : ended ? 'Descanso terminado' : 'Entrenando';

  // A timer text claims the widest value it may show: align it to the trailing edge, and fix its width where space is tight.
  function clock(kind: 'rest' | 'elapsed', color: string, style: 'largeTitle' | 'title2' | 'headline' | 'caption', width: number | null) {
    const range = kind === 'rest' ? interval : props.startedAt === null ? null
      : { lower: new Date(props.startedAt), upper: new Date(props.startedAt + 8 * 3600 * 1000) };
    // The elapsed time only from a confirmed start: never a made-up 0:00.
    if (!range) return null;
    const modifiers = [font({ textStyle: style, weight: kind === 'rest' ? 'bold' : 'semibold' }), monospacedDigit(), foregroundStyle(color), multilineTextAlignment('trailing')];
    if (width !== null) modifiers.push(frame({ width }));
    return <Text timerInterval={range} countsDown={kind === 'rest'} modifiers={modifiers} />;
  }
  function icon(color: string) {
    return <Image systemName={counting ? 'timer' : 'figure.strengthtraining.traditional'} color={color} />;
  }
  // The bar alone: its default label would repeat the countdown under it.
  function bar() {
    return counting && interval ? <ProgressView timerInterval={interval} countsDown modifiers={[tint(accent), labelsHidden()]} /> : null;
  }
  const main = counting ? clock('rest', accent, 'largeTitle', null) : clock('elapsed', text, 'title2', null);

  return {
    banner: (
      <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 16 }), activityBackgroundTint(background)]}>
        <HStack spacing={8}>
          {icon(accent)}
          <Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle(text), lineLimit(1)]}>{props.sessionName}</Text>
          <Spacer />
          {main}
        </HStack>
        <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle(muted), lineLimit(1)]}>
          {rest ? `${status} · ${rest.exerciseName}` : status}
        </Text>
        {bar()}
      </VStack>
    ),
    compactLeading: icon(accent),
    compactTrailing: counting ? clock('rest', accent, 'caption', 44) : clock('elapsed', muted, 'caption', 52),
    minimal: counting ? clock('rest', accent, 'caption', 36) : icon(accent),
    expandedLeading: (
      <VStack alignment="leading" spacing={4}>
        {icon(accent)}
        <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(muted)]}>{status}</Text>
      </VStack>
    ),
    expandedTrailing: counting ? clock('rest', accent, 'title2', null) : clock('elapsed', text, 'title2', null),
    expandedBottom: (
      <VStack alignment="leading" spacing={4}>
        <Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle(text), lineLimit(1)]}>{props.sessionName}</Text>
        {rest ? <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle(muted), lineLimit(1)]}>{rest.exerciseName}</Text> : null}
        {bar()}
      </VStack>
    ),
  };
}

export function workoutActivities() {
  return createLiveActivity<LiveActivityProps>('OwnlevelWorkout', workoutLayout);
}
