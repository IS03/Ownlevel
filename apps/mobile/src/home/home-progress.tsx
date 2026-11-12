import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ProgressBody, ProgressTrainingRecords } from '@/api/progress';
import { AppText, InlineUnavailable, SkeletonBlock, useOwnlevelTheme } from '@/design-system';

import { selectProgressRows, type HomeProgressTarget, type ProgressRowModel } from './home-progress-selection';
import type { HomeResource } from './home-resource';
import { HomeRow, HomeRowSeparator, HomeSection } from './home-ui';

export { recordsSummary, weightSummary, type HomeProgressTarget } from './home-progress-selection';

function ProgressRow({ onOpen, onRetry, row }: { onOpen: (target: HomeProgressTarget) => void; onRetry: () => void; row: ProgressRowModel }) {
  const { colors } = useOwnlevelTheme();
  const testID = `home-progress-${row.id}`;
  if (row.state === 'loading' || row.state === 'unavailable') {
    return (
      <HomeRow icon={row.icon} testID={testID} title={row.title}>
        <View style={styles.indent}>
          {row.state === 'loading' ? <SkeletonBlock height={14} width="60%" /> : <InlineUnavailable actionLabel="Reintentar" message="No pudimos cargarlo." onAction={onRetry} />}
        </View>
      </HomeRow>
    );
  }
  return (
    <HomeRow accessibilityHint="Abre el detalle" accessibilityLabel={`${row.title}. ${row.subtitle}${row.value ? `. ${row.value}` : ''}`} chevron
      icon={row.icon} onPress={() => onOpen(row.target)} subtitle={row.subtitle} testID={testID} title={row.title}
      trailing={row.value ? <AppText numeric variant="title2">{row.value}</AppText> : undefined}>
      {row.state === 'stale' ? (
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
        {selectProgressRows({ body, date, records }).map((row, index) => (
          <Fragment key={row.id}>
            {index > 0 ? <HomeRowSeparator inset /> : null}
            <ProgressRow onOpen={onOpen} onRetry={onRetry} row={row} />
          </Fragment>
        ))}
      </View>
    </HomeSection>
  );
}

const styles = StyleSheet.create({
  indent: { paddingLeft: 36, paddingTop: 2 },
});
