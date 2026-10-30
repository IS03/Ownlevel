import { Pressable, StyleSheet, View } from 'react-native';

import type { ProgressBody, ProgressTrainingExercise, ProgressTrainingRecords } from '@/api/progress';
import { AppText, InlineUnavailable, SkeletonBlock, useOwnlevelTheme } from '@/design-system';
import { formatValue } from '@/progress/progress-format';

import { formatInteger } from './format';
import type { HomeResource } from './home-resource';
import { HomeRow, HomeRowSeparator, HomeSection } from './home-ui';

export type HomeProgressTarget = { kind: 'body'; period: '7' } | { kind: 'training'; period: '7' | '30' }
  | { kind: 'exercise'; period: '30'; exerciseId: string };

type RowSummary = { title: string; subtitle: string; value?: string; target: HomeProgressTarget };

const shortDate = (date: string) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  .format(new Date(`${date}T12:00:00Z`)).replace('.', '');

/** Last weight and when it was logged (the value only lives here, not in Registrar). */
export function weightSummary(data: ProgressBody): RowSummary {
  const latest = data.metrics.find(metric => metric.key === 'body.weight')?.latest;
  const target = { kind: 'body', period: '7' } as const;
  if (!latest) return { title: 'Peso', subtitle: data.excludedSuspect > 0 ? 'Revisá tus registros en Cuerpo' : 'Sin registros', target };
  return {
    title: 'Peso', value: formatValue(latest.value, 'kg'), target,
    subtitle: latest.date === data.today ? 'Último registro: hoy' : `Último registro: ${shortDate(latest.date)}`,
  };
}

function exerciseChange(exercise: ProgressTrainingExercise): string {
  return `${exercise.status === 'improved' ? '↑' : '↓'} ${exercise.name} · ${exercise.signal!.description}`;
}

/** Records of the last 30 days; without records, M7's mode-aware assessment (never a fake PR). */
export function recordsSummary(data: ProgressTrainingRecords): RowSummary {
  const records = data.personalRecords;
  if (records.length) {
    const names = records.slice(0, 2).map(record => record.name).join(', ');
    return {
      title: records.length === 1 ? '1 récord en 30 días' : `${formatInteger(records.length)} récords en 30 días`,
      subtitle: records.length > 2 ? `${names} y ${formatInteger(records.length - 2)} más` : names,
      target: records.length === 1 ? { kind: 'exercise', period: '30', exerciseId: records[0].exerciseId } : { kind: 'training', period: '30' },
    };
  }
  const change = data.exercises.filter(exercise => exercise.signal && (exercise.status === 'improved' || exercise.status === 'declined'))
    .sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? ''))[0];
  if (change) return { title: 'Rendimiento en 30 días', subtitle: exerciseChange(change), target: { kind: 'exercise', period: '30', exerciseId: change.id } };
  return {
    title: 'Sin récords en 30 días', target: { kind: 'training', period: '30' },
    subtitle: data.performance.comparable > 0 ? 'Seguí sumando entrenamientos' : 'Faltan entrenamientos comparables',
  };
}

/** Today's snapshot only: a previous day's rolling period never passes as today's. */
function current<T extends { today: string }>(resource: HomeResource<T>, date: string): T | undefined {
  return resource.data?.today === date ? resource.data : undefined;
}

function ReadRow<T extends { today: string }>({ date, icon, label, onOpen, onRetry, resource, summarize, testID }: {
  date: string; icon: 'trophy' | 'scale'; label: string; onOpen: (target: HomeProgressTarget) => void; onRetry: () => void;
  resource: HomeResource<T>; summarize: (data: T) => RowSummary; testID: string;
}) {
  const { colors } = useOwnlevelTheme();
  const data = current(resource, date);
  if (!data) {
    const waiting = resource.status === 'loading' || (resource.status === 'ready' && !!resource.data);
    return (
      <HomeRow icon={icon} testID={testID} title={label}>
        <View style={styles.indent}>
          {waiting ? <SkeletonBlock height={14} width="60%" /> : <InlineUnavailable actionLabel="Reintentar" message="No pudimos cargarlo." onAction={onRetry} />}
        </View>
      </HomeRow>
    );
  }
  const row = summarize(data);
  const stale = resource.status === 'unavailable';
  return (
    <HomeRow accessibilityHint="Abre el detalle" accessibilityLabel={`${row.title}. ${row.subtitle}${row.value ? `. ${row.value}` : ''}`} chevron
      icon={icon} onPress={() => onOpen(row.target)} subtitle={row.subtitle} testID={testID} title={row.title}
      trailing={row.value ? <AppText numeric variant="title2">{row.value}</AppText> : undefined}>
      {stale ? (
        <Pressable accessibilityLabel="Reintentar" accessibilityRole="button" hitSlop={8} onPress={onRetry} style={styles.indent}>
          <AppText style={{ color: colors.textMuted }} variant="caption">Sin actualizar · Reintentar</AppText>
        </Pressable>
      ) : null}
    </HomeRow>
  );
}

export function HomeProgress({ body, date, onAll, onOpen, onRetry, records }: {
  body: HomeResource<ProgressBody>; date: string; onAll: () => void; onOpen: (target: HomeProgressTarget) => void;
  onRetry: () => void; records: HomeResource<ProgressTrainingRecords>;
}) {
  return (
    <HomeSection action="Ver todo" onAction={onAll} testID="home-progress" title="Progreso">
      <View>
        <ReadRow date={date} icon="trophy" label="Récords" onOpen={onOpen} onRetry={onRetry} resource={records} summarize={recordsSummary}
          testID="home-progress-records" />
        <HomeRowSeparator inset />
        <ReadRow date={date} icon="scale" label="Peso" onOpen={onOpen} onRetry={onRetry} resource={body} summarize={weightSummary}
          testID="home-progress-weight" />
      </View>
    </HomeSection>
  );
}

const styles = StyleSheet.create({
  indent: { paddingLeft: 36, paddingTop: 2 },
});
