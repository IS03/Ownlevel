import { useState } from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { NutritionReport, ReportDailyRow } from '@/api/nutrition-report';
import { reportFixture } from '@/nutrition/report-fixture.test-helper';
import { bucketNutritionChartDays } from '../../../../src/lib/nutrition/report-chart-core';
import { ProgressRangeProvider } from './progress-range-context';
import { NutritionChart, type NutritionChartNutrient, type NutritionInspection } from './nutrition-chart';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));

const onDate = jest.fn();
/** Bands and names are decorative (hidden from VoiceOver): the bar's label carries the stage. */
const H = { includeHiddenElements: true };
function Harness({ report, reference }: { report: NutritionReport; reference?: NutritionReport }) {
  const [selection, onSelect] = useState<NutritionInspection>(null);
  const [nutrient, onNutrient] = useState<NutritionChartNutrient>('calories');
  const [stages, onStages] = useState(false);
  return <NutritionChart report={report} reference={reference} selection={selection} onSelect={onSelect} onDate={onDate}
    nutrient={nutrient} onNutrient={onNutrient} stages={stages} onStages={onStages} />;
}
const tree = (report: NutritionReport, reference?: NutritionReport, mode: 'light' | 'dark' = 'light') => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode={mode}><ProgressRangeProvider initialToday="2026-10-04" initialState={{ unit: 'month', anchor: '2026-10-04', custom: null, compare: reference ? { kind: 'previous' } : { kind: 'none' } }}>
    <Harness report={report} reference={reference} />
  </ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>;
const flush = () => act(async () => {});
const withStages = (r: NutritionReport, stage: (date: string) => string | null) => { r.days = r.days.map(d => ({ ...d, goalStage: stage(d.date) })); return r; };
const nutrients = (d: ReportDailyRow, calories: number | null) => ({ ...d.nutrients, calories: calories === null ? { value: null, knownMeals: 0, missingMeals: 1, status: 'unknown' as const } : { value: calories, knownMeals: 1, missingMeals: 0, status: 'complete' as const } });

/** Ten days: a run cut by a date without label and repeated after it, a missing bar inside a run, a zero, an empty label. */
const DAILY: Record<string, string | null> = {
  '2026-09-25': 'Volumen', '2026-09-26': 'Volumen', '2026-09-27': null, '2026-09-28': 'Volumen', '2026-09-29': 'Volumen',
  '2026-09-30': 'Definición', '2026-10-01': 'Definición', '2026-10-02': 'Definición', '2026-10-03': '', '2026-10-04': 'Definición',
};
function daily() {
  const r = withStages(reportFixture({ period: 'custom', from: '2026-09-25', to: '2026-10-04' }), d => DAILY[d] ?? null);
  r.days = r.days.map(d => d.date === '2026-09-29' ? { ...d, nutrients: nutrients(d, null) } : d.date === '2026-10-01' ? { ...d, nutrients: nutrients(d, 0) } : d);
  return r;
}
/** 65 days in blocks of 7 (the last one 2 days), each block with its own label mix; protein denominators differ from calories. */
function long(from = '2026-08-01', to = '2026-10-04') {
  const r = reportFixture({ period: 'custom', from, to });
  const blocks = bucketNutritionChartDays([...r.days].reverse());
  const [mixed, single, none] = blocks;
  withStages(r, d => d >= mixed.start && d <= mixed.end ? (d <= '2026-08-03' ? 'Volumen' : d <= '2026-08-05' ? 'Definición' : null)
    : d >= single.start && d <= single.end ? 'Volumen'
    : d >= none.start && d <= none.end ? null
    : d === blocks.at(-1)!.end ? 'Mantenimiento' : null);
  r.evolution = blocks.map((b, i) => ({ start: b.start, end: b.end, includesToday: b.includesToday,
    metrics: { ...r.summary.metrics, calories: { value: 2000 + i, denominator: b.values.length, partialDays: 0 }, protein: { value: 120, denominator: Math.max(1, b.values.length - 2), partialDays: 0 } } }));
  return { r, blocks };
}
const chip = (view: ReturnType<typeof render>) => view.getByRole('checkbox', { name: 'Etapas' });

describe('#531 · Etapas en el gráfico de Nutrición', () => {
  it('the chip appears only when a loaded report has a label, starts off and draws nothing until turned on', async () => {
    const none = render(tree(withStages(reportFixture({ period: 'custom', from: '2026-09-25', to: '2026-10-04' }), () => null))); await flush();
    expect(none.queryByRole('checkbox', { name: 'Etapas' })).toBeNull();
    const view = render(tree(daily())); await flush();
    expect(chip(view).props.accessibilityState).toMatchObject({ checked: false });
    expect(view.queryByTestId('nutrition-chart-current-stage-2026-09-25', H)).toBeNull();
    expect(view.queryByTestId('nutrition-chart-current-stage-names', H)).toBeNull();
  });
  it('daily: bands follow contiguous dates with the same label, cut at a missing label, the name once per run', async () => {
    const view = render(tree(daily())); await flush();
    fireEvent.press(chip(view));
    expect(chip(view).props.accessibilityState).toMatchObject({ checked: true });
    const banded = Object.keys(DAILY).filter(d => view.queryByTestId(`nutrition-chart-current-stage-${d}`, H));
    expect(banded).toEqual(['2026-09-25', '2026-09-26', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-04']);
    const names = Object.keys(DAILY).filter(d => view.queryByTestId(`nutrition-chart-current-stage-name-${d}`, H));
    expect(names).toEqual(['2026-09-25', '2026-09-28', '2026-09-30', '2026-10-04']); // Volumen repeats after the cut; Definición after the empty label
    expect(view.getByTestId('nutrition-chart-current-stage-name-2026-09-30', H).props.children).toBe('Definición');
    // A run's band is joined inside and cut at its ends.
    const band = (d: string) => StyleSheet.flatten(view.getByTestId(`nutrition-chart-current-stage-${d}`, H).props.style);
    expect(band('2026-09-25')).toMatchObject({ left: 1 }); expect(band('2026-09-26')).toMatchObject({ right: 1 });
    expect(band('2026-09-30').right).toBeLessThan(0);
    // The missing bar keeps its gap inside its run; the zero keeps its base line over the band.
    expect(view.getByTestId('nutrition-chart-current-2026-09-29-gap')).toBeTruthy();
    const zero = view.getByTestId('nutrition-chart-current-2026-10-01-bar');
    expect(zero.findAll(n => StyleSheet.flatten(n.props.style)?.height === 1).length).toBeGreaterThan(0);
    expect(view.getByTestId('nutrition-chart-current-stage-2026-10-01', H)).toBeTruthy();
  });
  it('labels and detail say the full name or «Sin etapa informada»; toggling keeps the selected bar and its detail', async () => {
    const view = render(tree(daily())); await flush();
    fireEvent.press(view.getByTestId('nutrition-chart-current-2026-09-29-gap'));
    expect(view.queryByTestId('nutrition-chart-stage')).toBeNull(); // off: nothing about stages
    fireEvent.press(chip(view));
    expect(view.getByTestId('nutrition-chart-current-2026-09-29-gap').props.accessibilityState.selected).toBe(true);
    expect(view.getByTestId('nutrition-chart-stage').props.children).toBe('Etapa: Volumen.');
    expect(view.getByTestId('nutrition-chart-current-2026-09-29-gap').props.accessibilityLabel).toContain('Etapa: Volumen');
    expect(view.getByTestId('nutrition-chart-current-2026-09-27-bar').props.accessibilityLabel).toContain('Sin etapa informada');
    expect(view.getByTestId('nutrition-chart-current-2026-10-03-bar').props.accessibilityLabel).toContain('Sin etapa informada');
    fireEvent.press(view.getByTestId('nutrition-chart-current-2026-09-27-bar'));
    expect(view.getByTestId('nutrition-chart-stage').props.children).toBe('Sin etapa informada.');
    expect(view.getByRole('button', { name: /^Ver comidas de ese día/ })).toBeTruthy();
    fireEvent.press(chip(view));
    expect(view.getByTestId('nutrition-chart-current-2026-09-27-bar').props.accessibilityState.selected).toBe(true);
    expect(view.queryByTestId('nutrition-chart-stage')).toBeNull();
    expect(view.getByTestId('nutrition-chart-current-2026-09-27-bar').props.accessibilityLabel).not.toContain('etapa');
    fireEvent.press(view.getByRole('button', { name: /^Ver comidas de ese día/ }));
    expect(onDate).toHaveBeenCalledWith('2026-09-27');
  });
  it('blocks: one bar each; the detail counts calendar dates by label and without one, inclusive bounds, also in the short last block', async () => {
    const { r, blocks } = long();
    const view = render(tree(r)); await flush();
    fireEvent.press(chip(view));
    expect(view.queryByTestId(`nutrition-chart-current-stage-${blocks[0].start}`, H)).toBeNull(); // no segmented bands inside blocks
    expect(within(view.getByTestId('nutrition-chart-series-current')).getAllByRole('button')).toHaveLength(blocks.length);
    const detail = (start: string) => { fireEvent.press(view.getByTestId(`nutrition-chart-current-${start}-bar`)); return view.getByTestId('nutrition-chart-stage', H).props.children as string; };
    expect(detail(blocks[0].start)).toBe('Etapas del bloque: Volumen · 3 días; Definición · 2 días; sin etapa informada · 2 días.');
    expect(detail(blocks[1].start)).toBe('Etapas del bloque: Volumen · 7 días.');
    expect(detail(blocks[2].start)).toBe('Sin etapa informada en los 7 días del bloque.');
    const last = blocks.at(-1)!;
    expect(last.values).toHaveLength(2);
    expect(detail(last.start)).toBe('Etapas del bloque: Mantenimiento · 1 día; sin etapa informada · 1 día.');
    // Counts are dates, not denominators: switching to Protein (another denominator) keeps them.
    fireEvent.press(view.getByTestId(`nutrition-chart-current-${blocks[0].start}-bar`));
    fireEvent.press(view.getByRole('radio', { name: 'Proteína' }));
    expect(view.getByText(/5 días usados de 7 días del bloque/)).toBeTruthy();
    expect(view.getByTestId('nutrition-chart-stage', H).props.children).toBe('Etapas del bloque: Volumen · 3 días; Definición · 2 días; sin etapa informada · 2 días.');
    expect(chip(view).props.accessibilityState).toMatchObject({ checked: true });
  });
  it('granularity per side: A daily with B in blocks, and A in blocks with B daily; the state survives side and nutrient', async () => {
    const { r: longReport, blocks } = long('2026-06-01', '2026-08-04');
    const a = render(tree(daily(), longReport)); await flush();
    fireEvent.press(chip(a));
    expect(a.getByTestId('nutrition-chart-current-stage-2026-09-25', H)).toBeTruthy();
    fireEvent.press(a.getByRole('radio', { name: 'Comparación' }));
    expect(chip(a).props.accessibilityState).toMatchObject({ checked: true });
    expect(a.queryByTestId('nutrition-chart-reference-stage-names', H)).toBeNull();
    fireEvent.press(a.getByTestId(`nutrition-chart-reference-${blocks[1].start}-bar`));
    expect(a.getByTestId('nutrition-chart-stage', H).props.children).toBe('Etapas del bloque: Volumen · 7 días.');
    fireEvent.press(a.getByRole('radio', { name: 'Proteína' }));
    fireEvent.press(a.getByRole('radio', { name: 'Período elegido' }));
    expect(a.getByTestId('nutrition-chart-current-stage-2026-09-25', H)).toBeTruthy();

    const { r: currentLong } = long();
    const b = render(tree(currentLong, daily())); await flush();
    fireEvent.press(chip(b));
    expect(b.queryByTestId('nutrition-chart-current-stage-names', H)).toBeNull();
    fireEvent.press(b.getByRole('radio', { name: 'Comparación' }));
    expect(b.getByTestId('nutrition-chart-reference-stage-name-2026-09-25', H)).toBeTruthy();
    expect(b.getByTestId('nutrition-chart-reference-stage-2026-09-28', H)).toBeTruthy();
    expect(b.queryByTestId('nutrition-chart-reference-stage-2026-09-27', H)).toBeNull();
  });
  it('B alone can bring the chip: A without labels, B with them', async () => {
    const plain = withStages(reportFixture({ period: 'custom', from: '2026-09-25', to: '2026-10-04' }), () => null);
    const view = render(tree(plain, daily())); await flush();
    fireEvent.press(chip(view));
    expect(view.queryByTestId('nutrition-chart-current-stage-names', H)).toBeNull();
    fireEvent.press(view.getByRole('radio', { name: 'Comparación' }));
    expect(view.getByTestId('nutrition-chart-reference-stage-name-2026-09-25', H)).toBeTruthy();
  });
  it.each(['light', 'dark'] as const)('large text in %s: names stay one line as wide as their run, bars keep 44 pt and the scroll', async mode => {
    const rn = jest.requireActual<typeof import('react-native')>('react-native');
    const spy = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 320, height: 700, scale: 3, fontScale: 2 });
    const view = render(tree(daily(), undefined, mode)); await flush();
    fireEvent.press(chip(view));
    const name = view.getByTestId('nutrition-chart-current-stage-name-2026-09-25', H);
    expect(name.props.numberOfLines).toBe(1);
    const slot = 10 * 44 * 2 / 10;
    expect(StyleSheet.flatten(name.props.style).width).toBeCloseTo(2 * slot - 8, 5);
    for (const bar of within(view.getByTestId('nutrition-chart-series-current')).getAllByRole('button')) expect(StyleSheet.flatten(bar.props.style).minWidth).toBeGreaterThanOrEqual(44);
    expect(view.getByLabelText(/^Calorías · Período elegido/).props.horizontal).toBe(true);
    spy.mockRestore();
  });
});

describe('#531 · el desglose del bloque es accesible', () => {
  // The inspection region: one accessible element (live region on Android) whose label is what the reader says on selection.
  const region = (view: ReturnType<typeof render>) => view.getByTestId('nutrition-chart-inspection').findAll(n => n.props.accessible && n.props.accessibilityLiveRegion === 'polite')[0]!.props.accessibilityLabel as string;
  const MIXED = 'Etapas del bloque: Volumen, 3 días; Definición, 2 días; sin etapa informada, 2 días';
  it('mixed block: the bar and the inspection region say the whole breakdown; the visible line is not read twice', async () => {
    const { r, blocks } = long();
    const view = render(tree(r)); await flush();
    const bar = () => view.getByTestId(`nutrition-chart-current-${blocks[0].start}-bar`);
    expect(bar().props.accessibilityLabel).not.toMatch(/etapa/i); // off: nothing about stages
    fireEvent.press(bar());
    expect(region(view)).not.toMatch(/etapa/i);
    fireEvent.press(chip(view));
    expect(bar().props.accessibilityState.selected).toBe(true); // the selection survives the chip
    expect(bar().props.accessibilityLabel).toContain(`días usados, 0 con suma parcial, ${MIXED}, Período elegido`);
    expect(region(view)).toBe(`${blocks[0].start.split('-').reverse().join('/')} – ${blocks[0].end.split('-').reverse().join('/')}, Promedio del bloque · 2.000 kcal por día con dato, Período elegido, ${MIXED}`);
    // The same text stays on screen, hidden from the reader because the region already says it.
    const line = view.getByTestId('nutrition-chart-stage', H);
    expect(line.props.children).toBe('Etapas del bloque: Volumen · 3 días; Definición · 2 días; sin etapa informada · 2 días.');
    expect(line.props.accessibilityElementsHidden).toBe(true); expect(line.props.importantForAccessibility).toBe('no');
    expect(view.queryByTestId('nutrition-chart-stage')).toBeNull();
    // Protein keeps the breakdown and its own denominator; the bar keeps 44 pt.
    fireEvent.press(view.getByRole('radio', { name: 'Proteína' }));
    expect(bar().props.accessibilityLabel).toContain(`5 días usados, 0 con suma parcial, ${MIXED}`);
    expect(region(view)).toContain(MIXED);
    expect(StyleSheet.flatten(bar().props.style).minWidth).toBeGreaterThanOrEqual(44);
    // Off again: no stage information anywhere, same selection.
    fireEvent.press(chip(view));
    expect(bar().props.accessibilityState.selected).toBe(true);
    expect(bar().props.accessibilityLabel).not.toMatch(/etapa/i); expect(region(view)).not.toMatch(/etapa/i);
    expect(view.queryByTestId('nutrition-chart-stage', H)).toBeNull();
  });
  it('a block without any label says so in the bar and the region', async () => {
    const { r, blocks } = long();
    const view = render(tree(r)); await flush();
    fireEvent.press(chip(view));
    fireEvent.press(view.getByTestId(`nutrition-chart-current-${blocks[2].start}-bar`));
    expect(view.getByTestId(`nutrition-chart-current-${blocks[2].start}-bar`).props.accessibilityLabel).toContain('Sin etapa informada en los 7 días del bloque, Período elegido');
    expect(region(view)).toMatch(/, Sin etapa informada en los 7 días del bloque$/);
  });
  it('B in blocks: its bars and the region speak the breakdown of B, from B\'s own report', async () => {
    const { r: reference, blocks } = long('2026-06-01', '2026-08-04');
    const view = render(tree(daily(), reference)); await flush();
    fireEvent.press(chip(view));
    fireEvent.press(view.getByRole('radio', { name: 'Comparación' }));
    const bar = view.getByTestId(`nutrition-chart-reference-${blocks[1].start}-bar`);
    expect(bar.props.accessibilityLabel).toMatch(/Etapas del bloque: Volumen, 7 días, Comparación · /);
    fireEvent.press(bar);
    expect(region(view)).toMatch(/, Comparación · .+, Etapas del bloque: Volumen, 7 días$/);
    // A (daily) still says each day's stage, not a block breakdown.
    fireEvent.press(view.getByRole('radio', { name: 'Período elegido' }));
    expect(view.getByTestId('nutrition-chart-current-2026-09-25-bar').props.accessibilityLabel).toContain('Etapa: Volumen');
    expect(view.getByTestId('nutrition-chart-current-2026-09-25-bar').props.accessibilityLabel).not.toContain('Etapas del bloque');
  });
});

