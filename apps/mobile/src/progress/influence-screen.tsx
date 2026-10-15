import { useCallback } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { progressRequestKey } from '@/api/progress';
import { fetchProgressInfluenceSuggested } from '@/api/progress-influence';
import { AppIcon, AppText, Button, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, spacing, useOwnlevelTheme } from '@/design-system';
import { ProgressScroll } from './progress-scroll';
import { ProgressRow } from './progress-row';
import { useProgressRange } from './progress-range-context';
import { useProgressResource } from './use-progress-resource';
import { QUESTIONS, shortAnswer } from './influence-model';

export function InfluenceScreen() {
  const router = useRouter(), { colors } = useOwnlevelTheme(), { client } = useMobileApi(), { query, compare } = useProgressRange();
  const { state, data, refresh } = useProgressResource(client, `influence-suggested|${progressRequestKey(query, compare)}`,
    useCallback((c, s) => fetchProgressInfluenceSuggested(c, query, s, compare), [query, compare]));
  return <ProgressScroll title="Qué influye" testID="influence-screen">
    <View style={{ gap: spacing.xs }}><Heading level={2}>Preguntas para tus datos</Heading>
      <AppText muted>Comparan días tuyos entre sí. Muestran relaciones, no causas.</AppText></View>
    {state.status === 'loading' ? <SkeletonBlock height={240} /> : data ? <View>
      {state.status !== 'ready' ? <InlineUnavailable message="No se pudo actualizar. Mostramos la última lectura confirmada." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
      {data.questions.length ? data.questions.map(q => <ProgressRow key={q.key} testID={`influence-question-${q.key}`} label={`${QUESTIONS[q.key].title}. ${shortAnswer(q)}`}
        onPress={() => router.push({ pathname: '/(tabs)/progress/influence/answer', params: { ...q.definition, lag: String(q.definition.lag), key: q.key } })}>
        <AppIcon name={QUESTIONS[q.key].icon} color={colors.textMuted} size={20} />
        <View style={{ flex: 1, gap: spacing.xs }}><AppText variant="headline">{QUESTIONS[q.key].title}</AppText><AppText muted numeric variant="footnote">{shortAnswer(q)}</AppText></View>
      </ProgressRow>) : <AppText muted>Todavía no hay preguntas para tus datos. Podés armar la tuya.</AppText>}
    </View> : <UnavailableState title="No pudimos cargar las preguntas" description="Revisá la conexión e intentá nuevamente." action={<Button label="Reintentar" onPress={() => void refresh()} />} />}
    <ProgressRow testID="influence-build" onPress={() => router.push('/(tabs)/progress/influence/build')} label="Armar tu pregunta">
      <AppIcon name="plus" color={colors.primary} size={20} /><AppText variant="headline" style={{ flex: 1, color: colors.primary }}>Armar tu pregunta</AppText>
    </ProgressRow>
  </ProgressScroll>;
}
