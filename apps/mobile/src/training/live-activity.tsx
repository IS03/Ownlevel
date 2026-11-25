import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, lineLimit, monospacedDigit, multilineTextAlignment, padding, tint } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';
import type { LiveActivityProps } from './live-activity-model';

/**
 * Runs inside the widget extension: the 'widget' directive turns this function into text, so it can only use its
 * props and the SwiftUI components the extension exposes. iOS draws every countdown; no app code runs each second.
 * staleDate is the rest's end, so a rest that ends while the app is suspended reads «Descanso terminado».
 */
function workoutLayout(props: LiveActivityProps, environment: LiveActivityEnvironment) {
  'widget';
  const light = environment.colorScheme === 'light';
  const accent = light ? props.colors.accentLight : props.colors.accentDark;
  const muted = light ? props.colors.mutedLight : props.colors.mutedDark;
  // The Dynamic Island is always dark.
  const islandAccent = props.colors.accentDark;
  const islandMuted = props.colors.mutedDark;
  const rest = props.rest;
  const ended = !!rest && (environment.isStale === true || rest.endAt <= Date.now());
  const counting = !!rest && !ended;
  const interval = rest ? { lower: new Date(rest.startedAt), upper: new Date(rest.endAt) } : null;
  const status = counting ? 'Descanso' : ended ? 'Descanso terminado' : 'Entrenando';
  const detail = rest ? rest.exerciseName : props.sessionName;

  function countdown(color: string, style: 'largeTitle' | 'title2' | 'caption', width: number | null) {
    const modifiers = [font({ textStyle: style, weight: 'bold' }), monospacedDigit(), foregroundStyle(color), multilineTextAlignment('trailing')];
    // A timer text claims the widest value it may show; the compact island needs a fixed width.
    if (width !== null) modifiers.push(frame({ width }));
    return <Text timerInterval={interval ?? undefined} countsDown modifiers={modifiers} />;
  }
  function icon(color: string) {
    return <Image systemName={counting ? 'timer' : 'figure.strengthtraining.traditional'} color={color} />;
  }

  return {
    banner: (
      <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 16 })]}>
        <HStack spacing={8}>
          {icon(accent)}
          <Text modifiers={[font({ textStyle: 'headline' }), lineLimit(1)]}>{props.sessionName}</Text>
          <Spacer />
          {counting ? countdown(accent, 'largeTitle', null) : null}
        </HStack>
        <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle(muted), lineLimit(1)]}>
          {rest ? `${status} · ${rest.exerciseName}` : status}
        </Text>
        {counting && interval ? <ProgressView timerInterval={interval} countsDown modifiers={[tint(accent)]} /> : null}
      </VStack>
    ),
    compactLeading: icon(islandAccent),
    compactTrailing: counting ? countdown(islandAccent, 'caption', 44)
      : <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(islandMuted)]}>{ended ? 'Listo' : ''}</Text>,
    minimal: counting ? countdown(islandAccent, 'caption', 36) : icon(islandAccent),
    expandedLeading: (
      <VStack alignment="leading" spacing={4}>
        {icon(islandAccent)}
        <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(islandMuted)]}>{status}</Text>
      </VStack>
    ),
    expandedTrailing: counting ? countdown(islandAccent, 'title2', null) : undefined,
    expandedBottom: (
      <VStack alignment="leading" spacing={4}>
        <Text modifiers={[font({ textStyle: 'headline' }), lineLimit(1)]}>{props.sessionName}</Text>
        {rest ? <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle(islandMuted), lineLimit(1)]}>{detail}</Text> : null}
        {counting && interval ? <ProgressView timerInterval={interval} countsDown modifiers={[tint(islandAccent)]} /> : null}
      </VStack>
    ),
  };
}

export function workoutActivities() {
  return createLiveActivity<LiveActivityProps>('OwnlevelWorkout', workoutLayout);
}
