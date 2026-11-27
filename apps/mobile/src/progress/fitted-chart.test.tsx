import { fireEvent, render } from '@testing-library/react-native';
import { expect, it, jest } from '@jest/globals';
import * as Native from 'react-native';
import { StyleSheet } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { FittedChart, type FittedPoint } from './fitted-chart';
jest.mock('@/platform/haptics',()=>({haptics:{selection:jest.fn()}}));
const point=(date:string,value:number|null):FittedPoint=>({key:date,start:date,end:date,value,text:`${date}: ${value??'Sin dato'}`});
it('fits the full calendar interval with real time spacing, champagne and only adjacent known connections',()=>{
  const points=[point('2026-11-01',60),point('2026-11-02',61),point('2026-11-10',62),point('2026-11-12',null),point('2026-11-18',63)];
  const view=render(<OwnlevelThemeProvider initialMode="light"><FittedChart points={points} range={{start:'2026-11-01',end:'2026-11-30'}} mode="dots" connect selectedKey={null} onSelect={jest.fn()} testID="weight" /></OwnlevelThemeProvider>);
  const left=(date:string)=>StyleSheet.flatten(view.getByTestId(`weight-${date}-mark`).props.style).left;
  expect((left('2026-11-10')-left('2026-11-02'))/(left('2026-11-02')-left('2026-11-01'))).toBeCloseTo(8);
  expect(view.getByTestId('weight-line-2026-11-10',{includeHiddenElements:true})).toBeTruthy(); expect(view.queryByTestId('weight-line-2026-11-18',{includeHiddenElements:true})).toBeNull();
  expect(view.getByText('30 nov')).toBeTruthy();
});
it('one full-size adjustable surface reaches every day, including gaps, without overlapping tiny touch controls',()=>{
  const onSelect=jest.fn(); const points=Array.from({length:30},(_,i)=>point(`2026-11-${String(i+1).padStart(2,'0')}`,i===10?null:i));
  const tree=(selectedKey:string|null)=><OwnlevelThemeProvider><FittedChart points={points} range={{start:'2026-11-01',end:'2026-11-30'}} mode="bars" selectedKey={selectedKey} onSelect={onSelect} testID="days" /></OwnlevelThemeProvider>;
  const view=render(tree(null)), plot=()=>view.getByTestId('days-plot');
  expect(StyleSheet.flatten(plot().props.style).minHeight).toBeGreaterThanOrEqual(44);
  fireEvent(plot(),'accessibilityAction',{nativeEvent:{actionName:'increment'}}); expect(onSelect).toHaveBeenLastCalledWith('2026-11-01');
  view.rerender(tree('2026-11-10')); fireEvent(plot(),'accessibilityAction',{nativeEvent:{actionName:'increment'}}); expect(onSelect).toHaveBeenLastCalledWith('2026-11-11');
  view.rerender(tree('2026-11-30')); onSelect.mockClear(); fireEvent(plot(),'accessibilityAction',{nativeEvent:{actionName:'increment'}}); expect(onSelect).not.toHaveBeenCalled();
});
it('draws each historical target even in isolation and never bridges a missing target',()=>{
  const points=[{...point('2026-11-01',100),target:200},{...point('2026-11-02',null),target:null},{...point('2026-11-03',150),target:220}];
  const view=render(<OwnlevelThemeProvider><FittedChart points={points} range={{start:'2026-11-01',end:'2026-11-03'}} mode="bars" selectedKey={null} onSelect={jest.fn()} testID="targets" /></OwnlevelThemeProvider>);
  expect(view.getByTestId('targets-target-point-2026-11-01',{includeHiddenElements:true})).toBeTruthy(); expect(view.getByTestId('targets-target-point-2026-11-03',{includeHiddenElements:true})).toBeTruthy();
  expect(view.queryByTestId('targets-target-2026-11-03',{includeHiddenElements:true})).toBeNull();
});

it('keeps wider summary bars fully inside both ends of the plot', () => {
  const points = [point('2026-11-01', 1), point('2026-11-02', 2), point('2026-11-03', 3)];
  const view = render(<OwnlevelThemeProvider><FittedChart points={points} range={{start:'2026-11-01',end:'2026-11-03'}} mode="bars" maxBarWidth={40} selectedKey={null} onSelect={jest.fn()} testID="wide" /></OwnlevelThemeProvider>);
  for (const date of ['2026-11-01','2026-11-03']) {
    const mark = StyleSheet.flatten(view.getByTestId(`wide-${date}-bar`).props.style);
    expect(mark.left).toBeGreaterThanOrEqual(0);
    expect(Number(mark.left) + Number(mark.width)).toBeLessThanOrEqual(300);
  }
});

it('anchors positive bars and zero at the same baseline, and grows negative bars down from it', () => {
  const [first, second, negative, zero, gap] = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'];
  const tree = (values: number[]) => <OwnlevelThemeProvider initialMode="dark">
    <FittedChart points={[point(first, values[0]), point(second, values[1]), point(negative, -17), point(zero, 0), point(gap, null)]}
      range={{ start: first, end: gap }} mode="bars" selectedKey={null} onSelect={jest.fn()} testID="anchored" />
  </OwnlevelThemeProvider>;
  const view = render(tree([20, 40]));
  for (const values of [[20, 40], [700, 5], [8, 40]]) {
    view.rerender(tree(values));
    const baseline = view.getByTestId('anchored-baseline', { includeHiddenElements: true }).props.y1;
    const height = StyleSheet.flatten(view.getByTestId('anchored-plot').props.style).height;
    const ink = (date: string) => StyleSheet.flatten(view.getByTestId(`anchored-bar-ink-${date}`, { includeHiddenElements: true }).props.style);
    expect(ink(first).bottom).toBeCloseTo(height - baseline);
    expect(ink(second).bottom).toBeCloseTo(height - baseline);
    expect(ink(first).top).toBeUndefined();
    expect(ink(negative).top).toBeCloseTo(baseline);
    expect(ink(negative).bottom).toBeUndefined();
    expect(ink(zero).height).toBe(1);
    expect(ink(zero).bottom).toBeCloseTo(height - baseline);
    expect(view.queryByTestId(`anchored-bar-ink-${gap}`, { includeHiddenElements: true })).toBeNull();
  }
});

it('shows weight scale references and highlights the last recorded dot, while a gap breaks its line', () => {
  const dimensions = jest.spyOn(jest.requireActual<typeof Native>('react-native'), 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  const points = [point('2026-11-01', 60), point('2026-11-02', 62), point('2026-11-03', null), point('2026-11-05', 61), point('2026-11-06', null)];
  const view = render(<OwnlevelThemeProvider>
    <FittedChart points={points} range={{ start: '2026-11-01', end: '2026-11-06' }} mode="dots" unit="kg" connect showScale={false} showExtrema highlightLast
      selectedKey={null} onSelect={jest.fn()} testID="trend" />
  </OwnlevelThemeProvider>);
  const hidden = { includeHiddenElements: true };
  expect(view.getByTestId('trend-line-2026-11-02', hidden)).toBeTruthy();
  expect(view.queryByTestId('trend-line-2026-11-05', hidden)).toBeNull();
  expect(view.getByText('60 kg')).toBeTruthy();
  expect(view.getByText('62 kg')).toBeTruthy();
  expect(view.getByTestId('trend-2026-11-05-mark').findAllByProps({ testID: 'trend-last' })).not.toHaveLength(0);
  dimensions.mockRestore();
});
