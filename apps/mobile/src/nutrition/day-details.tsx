import { Pressable, StyleSheet, View } from 'react-native';
import type {
  MobileNutritionDayResponse,
  NutritionDayContext,
  NutritionDayFactor,
  NutritionDayMetric,
} from '@/api/nutrition-day';
import { AppIcon, AppText, brandTokens, useOwnlevelTheme, type AppIconName } from '@/design-system';
import { canWriteDay } from './day-write-model';
import { number } from './day-format';
import { nutrientReading } from './day-home-model';

export type DayContextField = 'target' | 'expenditure';
export type DayContextAction = (data: MobileNutritionDayResponse, reset?: DayContextField) => void;
export function metricValue(m: NutritionDayMetric, value: number | null): string {
  if (value === null) return 'Sin dato';
  if (m.valueType === 'duration') return `${Math.floor(value / 60)} h ${value % 60} min`;
  return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 }).format(value)}${m.unit ? ` ${m.unit}` : ''}`;
}
const energy = (value: number | null) => (value === null ? '—' : `${number(value)} kcal`);
const signed = (value: number) => `${value < 0 ? '−' : '+'}${number(Math.abs(value))} kcal`;
const allocation = { target: 'al objetivo', expenditure: 'al gasto', both: 'al objetivo y al gasto' };
export function factorState(factor: NutritionDayFactor) {
  if (factor.source === 'override') return 'Ajustado hoy';
  if (factor.key === 'training') return factor.active ? 'Sí, hubo sesión hoy' : 'No hubo sesión hoy';
  if (factor.key === 'work' && factor.source === 'schedule')
    return factor.active ? 'Sí, por tu horario' : 'No, por tu horario';
  return factor.active ? 'Se aplica hoy' : 'No se aplica hoy';
}
const factorName = (key: string) =>
  key === 'training' ? 'Entrenamiento' : key === 'work' ? 'Día laboral' : 'Extra del plan';
function EnergyBar({
  label,
  value,
  target,
  scale,
  muted,
  partial,
}: {
  label: string;
  value: number | null;
  target?: number | null;
  scale: number;
  muted?: boolean;
  partial?: boolean;
}) {
  const { colors } = useOwnlevelTheme();
  const targetLabel =
    target === undefined ? '' : `, objetivo ${target === null ? 'sin dato' : `${number(target)} kilocalorías`}`;
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value === null ? 'sin dato' : `${number(value)} kilocalorías`}${partial ? ', suma parcial' : ''}${targetLabel}${muted ? ', según tu plan' : ''}`}
      style={styles.energy}
    >
      <View style={styles.row}>
        <AppText muted variant="subheadline">
          {label}
        </AppText>
        <AppText numeric variant="headline">
          {energy(value)}
          {partial ? ' · parcial' : ''}
        </AppText>
      </View>
      {muted ? (
        <AppText muted variant="caption">
          según tu plan
        </AppText>
      ) : null}
      {value !== null ? (
        <View
          testID={muted ? 'day-expenditure-track' : 'day-intake-track'}
          style={[styles.track, { backgroundColor: colors.surfaceRaised }]}
        >
          <View
            testID={muted ? 'day-expenditure-bar' : 'day-intake-bar'}
            style={[
              styles.bar,
              {
                width: `${(value / scale) * 100}%`,
                backgroundColor: muted ? colors.textMuted : brandTokens.palette.dark.accent,
                opacity: muted ? 0.5 : 1,
              },
            ]}
          />
          {target !== undefined && target !== null ? (
            <View
              testID="day-target-mark"
              style={[styles.mark, { left: `${(target / scale) * 100}%`, backgroundColor: colors.text }]}
            />
          ) : null}
        </View>
      ) : null}
      {target !== undefined ? (
        <AppText muted numeric variant="caption">
          Objetivo {energy(target)}
        </AppText>
      ) : null}
    </View>
  );
}
function ExplanationRow({
  icon,
  title,
  subtitle,
  value,
  accessibilityLabel,
}: {
  icon: AppIconName;
  title: string;
  subtitle: string;
  value: string;
  accessibilityLabel: string;
}) {
  const { colors } = useOwnlevelTheme();
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[styles.explanation, { borderBottomColor: colors.border }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.surfaceRaised }]}>
        <AppIcon name={icon} size={17} color={colors.textMuted} />
      </View>
      <View style={styles.label}>
        <AppText variant="body">{title}</AppText>
        <AppText muted variant="caption">
          {subtitle}
        </AppText>
      </View>
      <AppText numeric variant="headline" style={styles.contribution}>
        {value}
      </AppText>
    </View>
  );
}
function Changes({ context }: { context: NutritionDayContext }) {
  const breakdown = context.breakdown;
  if (!breakdown || context.targetOverrideKcal !== null || context.expenditureOverrideKcal !== null) return null;
  const fixedNote =
    breakdown.baseExpenditureMode === 'automatic' ? 'Base automática, sin extras' : 'Fijo, todos los días';
  const keys = [...new Set(breakdown.factors.map((f) => f.key))];
  return keys.length ? (
    <View style={styles.section} testID="day-factors">
      <AppText accessibilityRole="header" muted variant="footnote">
        Qué cambia hoy
      </AppText>
      {keys.map((key) => {
        const factors = breakdown.factors.filter((f) => f.key === key);
        const subtitle = factors.map((f) => `${factorState(f)} · ${allocation[f.appliesTo]}`).join('\n');
        const value = factors.map((f) => signed(f.deltaKcal)).join('\n');
        const spoken = `${factorName(key)}, ${factors.map((f) => `${factorState(f)}, ${f.deltaKcal < 0 ? 'menos' : 'más'} ${number(Math.abs(f.deltaKcal))} kilocalorías ${allocation[f.appliesTo]}`).join(', ')}`;
        return (
          <ExplanationRow
            key={key}
            icon={key === 'training' ? 'dumbbell' : key === 'work' ? 'work' : 'settings'}
            title={factorName(key)}
            subtitle={subtitle}
            value={value}
            accessibilityLabel={spoken}
          />
        );
      })}
      <AppText muted numeric variant="caption">
        Base del plan {energy(breakdown.baseTargetKcal)} objetivo · {energy(breakdown.baseExpenditureKcal)} gasto
      </AppText>
    </View>
  ) : breakdown.expenditureMode === 'fixed' ? (
    <View style={styles.section} testID="day-fixed-origin">
      <AppText accessibilityRole="header" muted variant="footnote">
        De dónde sale
      </AppText>
      <ExplanationRow
        icon="settings"
        title="Gasto de tu plan"
        subtitle={fixedNote}
        value={energy(breakdown.baseExpenditureKcal)}
        accessibilityLabel={`Gasto de tu plan, ${fixedNote}, ${number(breakdown.baseExpenditureKcal)} kilocalorías`}
      />
      <ExplanationRow
        icon="nutrition"
        title="Objetivo"
        subtitle="Automático"
        value={energy(breakdown.baseTargetKcal)}
        accessibilityLabel={`Objetivo, automático, ${number(breakdown.baseTargetKcal)} kilocalorías`}
      />
    </View>
  ) : null;
}
export function NutritionDayDetails({
  data,
  onContext,
}: {
  data: MobileNutritionDayResponse;
  onActivity?: (data: MobileNutritionDayResponse) => void;
  onContext?: DayContextAction;
}) {
  const { colors } = useOwnlevelTheme();
  const n = data.nutrition.status === 'ok' && data.nutrition.data.dayState === 'recorded' ? data.nutrition.data : null;
  const reading = n ? nutrientReading(n.summary.calories, n.summary.entryCount, n.context.calorieTarget) : null;
  const intake = reading?.value ?? null,
    expenditure = n?.context.expenditureKcal ?? null,
    target = n?.context.calorieTarget ?? null;
  const scale = Math.max(1, intake ?? 0, expenditure ?? 0, target ?? 0);
  const balance = intake === null ? null : (n?.context.energyBalanceKcal ?? null);
  const shownBalance =
    balance === null
      ? '—'
      : `${balance < 0 ? '↘' : balance > 0 ? '↗' : '→'} ${energy(Math.abs(balance))}${reading?.partial ? ' · parcial' : ''}`;
  return (
    <View style={styles.content} testID="nutrition-day-details">
      <View style={styles.section}>
        <EnergyBar label="Comiste" value={intake} target={target} scale={scale} partial={reading?.partial} />
        <EnergyBar label="Gasto estimado" value={expenditure} scale={scale} muted />
        <View
          accessible
          accessibilityLabel={`Balance del día, ${balance === null ? 'sin dato' : `${balance < 0 ? 'menos' : balance > 0 ? 'más' : ''} ${number(Math.abs(balance))} kilocalorías`}${reading?.partial ? ', parcial' : ''}`}
          style={[styles.balance, { borderTopColor: colors.border }]}
        >
          <AppText variant="headline">Balance del día</AppText>
          <AppText numeric variant="title2">
            {shownBalance}
          </AppText>
        </View>
      </View>
      {!n ? (
        <AppText muted>
          {data.nutrition.status === 'unavailable'
            ? 'No pudimos consultar la energía de esta fecha.'
            : 'Esta fecha todavía no tiene un registro nutricional.'}
        </AppText>
      ) : (
        <>
          {reading?.partial ? (
            <AppText muted variant="caption">
              La suma incluye solo calorías conocidas. Sin dato no significa cero.
            </AppText>
          ) : null}
          <Changes context={n.context} />
          {(['target', 'expenditure'] as const).map((field) => {
            const value = field === 'target' ? n.context.targetOverrideKcal : n.context.expenditureOverrideKcal;
            const title = field === 'target' ? 'Objetivo' : 'Gasto estimado';
            return value !== null ? (
              <View key={field} style={[styles.adjustment, { borderTopColor: colors.border }]}>
                <ExplanationRow
                  icon="edit"
                  title={title}
                  subtitle="Ajustado hoy"
                  value={energy(value)}
                  accessibilityLabel={`${title}, ajustado hoy, ${number(value)} kilocalorías`}
                />
                {onContext && canWriteDay('context', data) ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Volver al automático: ${field === 'target' ? 'objetivo' : 'gasto'}`}
                    onPress={() => onContext(data, field)}
                    style={styles.reset}
                  >
                    <AppText style={{ color: colors.primary }} variant="subheadline">
                      Volver al automático
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            ) : null;
          })}
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  content: { gap: 24 },
  section: { gap: 16 },
  energy: { gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' },
  track: { height: 10, borderRadius: 5 },
  bar: { height: 10, borderRadius: 5 },
  mark: { position: 'absolute', width: 2, height: 16, top: -3, marginLeft: -1 },
  balance: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
    flexWrap: 'wrap',
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  explanation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, gap: 2 },
  contribution: { textAlign: 'right', flexShrink: 1 },
  adjustment: { gap: 4, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  reset: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-end' },
});
