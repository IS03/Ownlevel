import { fireEvent, render } from '@testing-library/react-native';
import { expect, it, jest } from '@jest/globals';
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
