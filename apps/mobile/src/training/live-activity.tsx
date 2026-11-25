import { Button, HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { activityBackgroundTint, buttonStyle, controlSize, font, foregroundStyle, frame, labelsHidden, lineLimit, monospacedDigit, multilineTextAlignment, padding, tint } from '@expo/ui/swift-ui/modifiers';
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
  const rest = props.rest, sets = props.sets, next = props.next, watch = props.stopwatch;
  const ended = !!rest && (environment.isStale === true || rest.endAt <= Date.now());
  const counting = !!rest && !ended;
  // A timed set running: it leads the activity, counting up from its start (iOS counts, no app code each second).
  const timing = !!watch && !counting;
  const targetLabel = watch?.target ? (watch.target >= 60 ? `${Math.floor(watch.target / 60)}:${String(watch.target % 60).padStart(2, '0')}` : `${watch.target} s`) : null;
  const interval = rest ? { lower: new Date(rest.startedAt), upper: new Date(rest.endAt) } : null;
  const status = counting ? 'Descanso' : timing ? 'Serie en curso' : ended ? 'Descanso terminado' : 'Entrenando';
  const allDone = !!sets && sets.done >= sets.total;
  const count = sets ? `${sets.done} de ${sets.total} series` : null;
  // What comes next, only when known: the set and its load as the session screen shows them.
  const nextLine = next ? [next.set, next.load].filter(Boolean).join(' · ') : null;

  // A timer text claims the widest value it may show: align it to the trailing edge, and fix its width where space is tight.
  function clock(kind: 'rest' | 'elapsed' | 'set', color: string, style: 'largeTitle' | 'title2' | 'headline' | 'caption', width: number | null) {
    const from = kind === 'set' ? watch?.startedAt ?? null : props.startedAt;
    const range = kind === 'rest' ? interval : from === null ? null : { lower: new Date(from), upper: new Date(from + 8 * 3600 * 1000) };
    // The elapsed time only from a confirmed start: never a made-up 0:00.
    if (!range) return null;
    const modifiers = [font({ textStyle: style, weight: kind === 'elapsed' ? 'semibold' : 'bold' }), monospacedDigit(), foregroundStyle(color), multilineTextAlignment('trailing')];
    if (width !== null) modifiers.push(frame({ width }));
    return <Text timerInterval={range} countsDown={kind === 'rest'} modifiers={modifiers} />;
  }
  function icon(color: string) {
    return <Image systemName={counting ? 'timer' : timing ? 'stopwatch' : 'figure.strengthtraining.traditional'} color={color} />;
  }
  // The bar alone: its default label would repeat the countdown under it.
  function bar() {
    return counting && interval ? <ProgressView timerInterval={interval} countsDown modifiers={[tint(accent), labelsHidden()]} /> : null;
  }
  // «Siguiente: SENTADILLA» and «Serie 3 de 4 · 100 kg × 8»; when every set is done, says so instead.
  function upcoming() {
    if (timing && watch) return <VStack alignment="leading" spacing={4}>
      <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' }), foregroundStyle(text), lineLimit(1)]}>{watch.exerciseName || 'Serie por tiempo'}</Text>
      {targetLabel ? <Text modifiers={[font({ textStyle: 'footnote' }), monospacedDigit(), foregroundStyle(muted), lineLimit(1)]}>{`Objetivo ${targetLabel}`}</Text> : null}
    </VStack>;
    if (allDone) return <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle(text), lineLimit(1)]}>Todas las series hechas</Text>;
    if (!next) return null;
    return <VStack alignment="leading" spacing={4}>
      <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' }), foregroundStyle(text), lineLimit(1)]}>{next.exerciseName ? `Siguiente: ${next.exerciseName}` : 'Siguiente serie'}</Text>
      {nextLine ? <Text modifiers={[font({ textStyle: 'footnote' }), monospacedDigit(), foregroundStyle(muted), lineLimit(1)]}>{nextLine}</Text> : null}
    </VStack>;
  }
  // #645 · Buttons, only while the session screen can act. Targets match REST_ADD / REST_SKIP / STOPWATCH_STOP and the «set:» target in
  // live-activity-model (this function runs as text and cannot import them). A tap runs in the app: same clock, same draft.
  function actions() {
    const controls = props.controls;
    const restButtons = !!controls?.rest && counting;
    const stop = !!controls?.stop && timing;
    if (!controls || (!restButtons && !controls.complete && !stop)) return null;
    const quiet = [buttonStyle('bordered'), tint(accent), controlSize('small')];
    return <HStack spacing={8}>
      {restButtons ? <Button label="+15 s" systemImage="plus" target="rest:add15" modifiers={quiet} /> : null}
      {restButtons ? <Button label="Saltar" systemImage="forward.end" target="rest:skip" modifiers={quiet} /> : null}
      <Spacer />
      {stop ? <Button label="Parar" systemImage="stop.fill" target="timer:stop"
        modifiers={[buttonStyle('borderedProminent'), tint(accent), foregroundStyle(background), controlSize('small')]} /> : null}
      {controls.complete ? <Button label="Completar serie" systemImage="checkmark" target={controls.complete}
        modifiers={[buttonStyle('borderedProminent'), tint(accent), foregroundStyle(background), controlSize('small')]} /> : null}
    </HStack>;
  }
  function counter(style: 'caption' | 'footnote') {
    return count ? <Text modifiers={[font({ textStyle: style }), monospacedDigit(), foregroundStyle(muted), lineLimit(1)]}>{count}</Text> : null;
  }
  const main = counting ? clock('rest', accent, 'largeTitle', null) : timing ? clock('set', accent, 'largeTitle', null) : clock('elapsed', text, 'title2', null);

  return {
    banner: (
      <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 16 }), activityBackgroundTint(background)]}>
        <HStack spacing={8}>
          {icon(accent)}
          <VStack alignment="leading" spacing={4}>
            <Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle(text), lineLimit(1)]}>{props.sessionName}</Text>
            <Text modifiers={[font({ textStyle: 'caption' }), monospacedDigit(), foregroundStyle(muted), lineLimit(1)]}>{count ? `${status} · ${count}` : status}</Text>
          </VStack>
          <Spacer />
          {main}
        </HStack>
        {upcoming()}
        {bar()}
        {actions()}
      </VStack>
    ),
    // Closed: the icon with the sets done, and the rest countdown or the session time.
    compactLeading: (
      <HStack spacing={4}>
        {icon(accent)}
        {sets ? <Text modifiers={[font({ textStyle: 'caption', weight: 'semibold' }), monospacedDigit(), foregroundStyle(text)]}>{`${sets.done}/${sets.total}`}</Text> : null}
      </HStack>
    ),
    compactTrailing: counting ? clock('rest', accent, 'caption', 44) : timing ? clock('set', accent, 'caption', 44) : clock('elapsed', muted, 'caption', 52),
    minimal: counting ? clock('rest', accent, 'caption', 36) : timing ? clock('set', accent, 'caption', 36) : icon(accent),
    expandedLeading: (
      <VStack alignment="leading" spacing={4}>
        {icon(accent)}
        <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(muted)]}>{status}</Text>
      </VStack>
    ),
    expandedTrailing: counting ? clock('rest', accent, 'title2', null) : timing ? clock('set', accent, 'title2', null) : clock('elapsed', text, 'title2', null),
    expandedBottom: (
      <VStack alignment="leading" spacing={8}>
        <HStack spacing={8}>
          <Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle(text), lineLimit(1)]}>{props.sessionName}</Text>
          <Spacer />
          {counter('caption')}
        </HStack>
        {upcoming()}
        {bar()}
        {actions()}
      </VStack>
    ),
  };
}

export function workoutActivities() {
  return createLiveActivity<LiveActivityProps>('OwnlevelWorkout', workoutLayout);
}
