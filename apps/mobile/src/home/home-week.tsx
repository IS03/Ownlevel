import { Pressable, StyleSheet, View } from 'react-native';

import type { MobileHomeResponse } from '@/api/home';
import type { ProgressHabitWeek } from '@/api/progress';
import type { NutritionReport } from '@/api/nutrition-report';
import { AppText, ExampleFrame, InlineUnavailable, SkeletonBlock, brandTokens, spacing, useOwnlevelTheme } from '@/design-system';

import { formatInteger, formatTrainingMinutes, plural } from './format';
import { HomeHabits } from './home-habits';
import { HomeCarousel } from './home-carousel';
import type { HomeTrainingWeek } from './home-data';
import { WEEKDAY_LETTERS, weekDates } from './home-day';
import type { HomeResource } from './home-resource';
import { HomeBar, HomeSection } from './home-ui';

const WEEKDAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const CAPSULE_HEIGHT = 8;
const LETTER_LINE = 18;
const DAY_GAP = 6;

type DayCalories = { date: string; value: number | null; target: number | null };

/** Calories per day of the week from the nutrition report; a day without data stays null (never 0). */
export function weekCalories(report: NutritionReport, dates: string[]): DayCalories[] {
  return dates.map(date => {
    const row = report.days.find(day => day.date === date);
    const calories = row?.nutrients.calories;
    const known = !!row && row.hasNutrition && !!calories && calories.value !== null && calories.status !== 'none' && calories.status !== 'unknown';
    return { date, target: row?.targetCalories ?? null, value: known ? calories!.value : null };
  });
}

/** Sessions per day of the week (completed sessions from the training history). */
export function weekStrip(week: HomeTrainingWeek, dates: string[]) {
  return dates.map(date => ({ date, count: week.sessions.filter(session => session.logDate === date).length }));
}

/** Accessible name of one day of the strip ("Lunes, entrenaste" / "Jueves, sin entreno"). */
export function dayLabel(index: number, done: boolean, isToday: boolean): string {
  return `${WEEKDAY_NAMES[index]}${isToday ? ', hoy' : ''}, ${done ? 'entrenaste' : 'sin entreno'}`;
}

/**
 * Linear week calendar: 7 equal capsules (Monday first). A day with at least one session
 * is filled with the accent (several sessions are still one capsule); a day without one,
 * or a future day, keeps the track color. Past days open that day in the history.
 */
function Days({ dates, onOpenDay, today, trained }: { dates: string[]; onOpenDay?: (date: string) => void; today: string; trained: Set<string> }) {
  const { colors } = useOwnlevelTheme();
  return (
    <View style={styles.days} testID="home-week-strip">
      {dates.map((date, index) => {
        const isToday = date === today;
        const done = trained.has(date);
        const content = (
          <>
            <HomeBar color={colors.primary} fraction={done ? 1 : 0} height={CAPSULE_HEIGHT} testID={`home-week-marker-${date}`} />
            <AppText style={[styles.letter, isToday ? { color: colors.primary, fontWeight: '600' } : { color: colors.textMuted }]}
              testID={isToday ? 'home-week-today' : undefined}>
              {WEEKDAY_LETTERS[index]}
            </AppText>
          </>
        );
        const label = dayLabel(index, done, isToday);
        return onOpenDay && date <= today ? (
          <Pressable accessibilityHint="Abre este día en el historial" accessibilityLabel={label} accessibilityRole="button" key={date}
            onPress={() => onOpenDay(date)} style={({ pressed }) => [styles.day, pressed && { opacity: 0.55 }]} testID={`home-week-day-${date}`}>
            {content}
          </Pressable>
        ) : <View accessible accessibilityLabel={label} key={date} style={styles.day} testID={`home-week-day-${date}`}>{content}</View>;
      })}
    </View>
  );
}

/** Big number with its unit beside it ("5 entrenos", "1.105 / 2.100 kcal"). */
export function BigNumber({ mutedColor, unit, value }: { mutedColor?: string; unit?: string; value: string }) {
  return (
    <AppText numeric style={styles.bigLine}>
      <AppText numeric variant="largeTitle">{value}</AppText>
      {unit ? <AppText muted numeric style={mutedColor ? { color: mutedColor } : undefined} variant="body">{` ${unit}`}</AppText> : null}
    </AppText>
  );
}

function TrainingSummary({ dates, onOpenDay, today, training, week }: {
  dates: string[]; onOpenDay: (date: string) => void; today: string; training: HomeResource<HomeTrainingWeek>;
  week: MobileHomeResponse['training']['week'] | undefined;
}) {
  if (!week) {
    return <View style={styles.summary}><SkeletonBlock height={41} width={140} /><SkeletonBlock height={18} width={180} /><SkeletonBlock height={CAPSULE_HEIGHT} /></View>;
  }
  if (week.status === 'unavailable') {
    return <View style={styles.summary} testID="home-week-training"><InlineUnavailable message="No pudimos cargar la semana." /></View>;
  }
  const s = week.data.summary;
  const history = training.data?.weekStart === dates[0] ? training.data : undefined;
  const fromHistory = history ? new Set(weekStrip(history, dates).filter(day => day.count > 0).map(day => day.date)) : null;
  const trained = fromHistory ?? new Set(s.trainingDays);
  const detail = `${plural(s.sets, 'serie')} · ${formatTrainingMinutes(s.minutes)}`;
  return (
    <View style={styles.summary} testID="home-week-training">
      <View accessible accessibilityLabel={`${plural(s.sessions, 'entreno')} esta semana, ${detail}`} testID="home-week-summary">
        <BigNumber unit={s.sessions === 1 ? 'entreno' : 'entrenos'} value={formatInteger(s.sessions)} />
        <AppText muted numeric variant="subheadline">{detail}</AppText>
      </View>
      <Days dates={dates} onOpenDay={onOpenDay} today={today} trained={trained} />
      {!history && training.status === 'unavailable' ? <AppText muted variant="footnote">No pudimos cargar el detalle por día.</AppText> : null}
    </View>
  );
}

function NutritionSummary({ calories, onOpen, today, weekStart }: {
  calories: HomeResource<NutritionReport>; onOpen: () => void; today: string; weekStart: string;
}) {
  const data = calories.data?.range.start === weekStart && calories.data.range.end === today && calories.data.today === today ? calories.data : undefined;
  if (!data) return calories.status === 'loading'
    ? <View style={styles.nutrition} testID="home-week-nutrition-loading"><SkeletonBlock height={41} width={180} /><SkeletonBlock height={52} /><SkeletonBlock height={18} /></View>
    : <InlineUnavailable message="No pudimos cargar Nutrición de esta semana." />;
  const stat = data.summary.metrics.calories;
  const average = stat.value === null ? '—' : formatInteger(Math.round(stat.value));
  const coverage = `${stat.denominator} de 7 días`;
  const dates = weekDates(weekStart);
  const days = weekCalories(data, dates);
  const macroLabel = (['protein', 'carbs', 'fat'] as const).map(key => {
    const metric = data.summary.metrics[key];
    const name = { protein: 'Proteína', carbs: 'Carbos', fat: 'Grasas' }[key];
    return `${name}: ${metric.value === null ? '—' : `${formatInteger(Math.round(metric.value))} g`}. Promedio de ${metric.denominator} de 7 días con datos${metric.partialDays ? `, ${plural(metric.partialDays, 'día parcial', 'días parciales')}` : ''}`;
  });
  return <Pressable accessibilityHint="Promedios de días terminados con datos. Abre el reporte de esta semana."
    accessibilityLabel={`${average} kcal promedio, ${coverage}${stat.partialDays ? `, ${plural(stat.partialDays, 'día parcial', 'días parciales')}` : ''}. ${macroLabel.join('. ')}. ${days.map((day, index) => calorieDayLabel(day, index, today)).join('. ')}${calories.status === 'unavailable' ? '. Sin actualizar, última lectura disponible' : ''}`}
    accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.nutrition, pressed && { opacity: 0.55 }]} testID="home-week-calories">
    <View style={styles.nutritionHeader}>
      <BigNumber unit="kcal promedio" value={average} />
      <View style={styles.nutritionCoverage}>
        <AppText muted numeric variant="footnote">{coverage}</AppText>
        {data.days.some(day => day.targetCalories !== null) ? <AppText muted variant="caption">— Objetivo diario</AppText> : null}
      </View>
    </View>
    <CalorieDays days={days} today={today} />
    <View style={styles.macros}>
      {([['protein', 'Proteína'], ['carbs', 'Carbos'], ['fat', 'Grasas']] as const).map(([key, title]) => {
        const macro = data.summary.metrics[key];
        const value = macro.value === null ? '—' : `${formatInteger(Math.round(macro.value))} g`;
        return <AppText accessibilityLabel={`${title}: ${value}. Promedio de ${macro.denominator} de 7 días con datos${macro.partialDays ? `, ${plural(macro.partialDays, 'día parcial', 'días parciales')}` : ''}`}
          key={key} muted numeric testID={`home-week-${key}`} variant="footnote">
          {title} <AppText numeric variant="footnote" style={styles.macroValue}>{value}</AppText>
        </AppText>;
      })}
    </View>
    {calories.status === 'unavailable' ? <AppText muted variant="footnote">Sin actualizar · Última lectura disponible</AppText> : null}
  </Pressable>;
}

function calorieDayLabel(day: DayCalories, index: number, today: string) {
  if (day.date > today) return `${WEEKDAY_NAMES[index]}. Por venir`;
  return `${WEEKDAY_NAMES[index]}. ${day.value === null ? 'Sin datos' : `${formatInteger(day.value)} kcal`}${day.date === today ? ', hoy en curso, no incluido en el promedio' : ''}${day.target !== null ? `. Objetivo ${formatInteger(day.target)} kcal` : ''}`;
}

/** One scale from zero, including signed values. Targets use each day's snapshot, never today's goal for older days. */
function CalorieDays({ days, today }: { days: DayCalories[]; today: string }) {
  const { colors } = useOwnlevelTheme();
  const observed = days.filter(day => day.date <= today);
  const values = observed.flatMap(day => [day.value ?? 0, day.target ?? 0]);
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const span = max - min || 1;
  const position = (value: number) => (max - value) / span * 100;
  return <View style={styles.calorieChart}>
    <View style={styles.calorieDays}>
      {days.map((day, index) => {
        const future = day.date > today, current = day.date === today;
        const missing = !future && day.value === null;
        const value = future ? null : day.value;
        return <View accessibilityLabel={calorieDayLabel(day, index, today)}
          key={day.date} style={styles.calorieDay}>
          <View style={[styles.calorieTrack, future && { backgroundColor: colors.surfaceRaised }, missing && { borderColor: colors.border, borderWidth: 1 },
            current && { borderColor: colors.textMuted, borderWidth: 1, borderStyle: 'dashed' }]} testID={`home-week-calorie-${day.date}`}>
            {!future && min < 0 ? <View style={[styles.calorieLine, { backgroundColor: colors.border, top: `${position(0)}%` }]} /> : null}
            {value !== null && value !== 0 ? <View style={[styles.calorieFill, { backgroundColor: colors.primary,
              top: `${position(Math.max(0, value))}%`, height: `${Math.abs(value) / span * 100}%`, opacity: current ? 0.5 : 1 }]}
              testID={`home-week-calorie-${day.date}-fill`} /> : null}
            {value === 0 ? <View style={[styles.calorieLine, { backgroundColor: colors.primary, top: `${position(0)}%` }]} testID={`home-week-calorie-${day.date}-zero`} /> : null}
            {!future && day.target !== null ? <View style={[styles.calorieLine, { backgroundColor: colors.textMuted, top: `${position(day.target)}%` }]}
              testID={`home-week-calorie-${day.date}-target`} /> : null}
          </View>
          <AppText muted numeric style={[styles.calorieLetter, current && styles.currentLetter]} variant="caption">{WEEKDAY_LETTERS[index]}</AppText>
        </View>;
      })}
    </View>
  </View>;
}

function ExampleWeek({ dates, today }: { dates: string[]; today: string }) {
  return (
    <ExampleFrame>
      <View style={styles.summary}>
        <View>
          <BigNumber unit="entrenos" value="3" />
          <AppText muted variant="subheadline">48 series · 2 h 30 min</AppText>
        </View>
        <Days dates={dates} today={today} trained={new Set([dates[0], dates[1], dates[3]])} />
      </View>
    </ExampleFrame>
  );
}

export function HomeWeek({
  calories, habits, onOpenHabit, onMetrics, onOpenCalories, onOpenDay, onProgress, today, training, week, weekStart,
}: {
  calories: HomeResource<NutritionReport>;
  habits: HomeResource<ProgressHabitWeek>;
  onOpenHabit: (metricId: string) => void;
  onMetrics: () => void;
  onOpenCalories: () => void;
  onOpenDay: (date: string) => void;
  onProgress: () => void;
  today: string;
  training: HomeResource<HomeTrainingWeek>;
  week: MobileHomeResponse['training']['week'] | undefined;
  weekStart: string;
}) {
  const dates = weekDates(weekStart);
  const firstTime = training.data !== undefined && !training.data.everTrained;
  return (
    <HomeSection accessibilityLabel="Progreso" action="Progreso →" onAction={onProgress} testID="home-week" title="Esta semana">
      <HomeCarousel minimumHeight={firstTime ? 208 : 176} pages={[
        { label: 'Entrenos', content: firstTime ? (
          <>
            <ExampleWeek dates={dates} today={today} />
            <AppText muted variant="footnote">Con tu primer entrenamiento, esto pasa a ser tuyo.</AppText>
          </>
        ) : <TrainingSummary dates={dates} onOpenDay={onOpenDay} today={today} training={training} week={week} /> },
        { label: 'Nutrición', content: <NutritionSummary calories={calories} onOpen={onOpenCalories} today={today} weekStart={weekStart} /> },
        { label: 'Hábitos', content: <HomeHabits habits={habits} onOpen={onOpenHabit} onMetrics={onMetrics} today={today} weekStart={weekStart} /> },
      ]} />
    </HomeSection>
  );
}

const styles = StyleSheet.create({
  bigLine: { lineHeight: 41 },
  day: { flex: 1, gap: DAY_GAP, justifyContent: 'center', minHeight: brandTokens.layout.minTouch },
  days: { flexDirection: 'row', gap: 6 },
  nutrition: { gap: brandTokens.space.xs },
  nutritionHeader: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: brandTokens.space.xs },
  calorieChart: { gap: brandTokens.space.xxs },
  nutritionCoverage: { alignItems: 'flex-end' },
  calorieDays: { flexDirection: 'row', gap: brandTokens.space.xs },
  calorieDay: { flex: 1, gap: brandTokens.space.xxs },
  calorieTrack: { height: brandTokens.layout.buttonHeight, borderRadius: brandTokens.radius.chip },
  calorieFill: { position: 'absolute', width: '100%', borderRadius: brandTokens.radius.chip },
  calorieLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth },
  calorieLetter: { textAlign: 'center' },
  currentLetter: { fontWeight: '700', textDecorationLine: 'underline' },
  macros: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: brandTokens.space.xs },
  macroValue: { fontWeight: '600' },
  letter: { fontSize: 13, lineHeight: LETTER_LINE, textAlign: 'center' },
  summary: { gap: spacing.md },
});
