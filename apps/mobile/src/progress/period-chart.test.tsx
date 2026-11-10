import { render, fireEvent } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { PeriodChart } from './period-chart';
jest.mock('expo-symbols',()=>({SymbolView:()=>null}));
const points=[{key:'a',label:'1',value:2,text:'01/11/2026: 2 series'},{key:'b',label:'2',value:4,text:'02/11/2026: 4 series'},{key:'c',label:'3',value:0,text:'03/11/2026: 0 series'},{key:'d',label:'4',value:null,text:'04/11/2026: sin dato'}];
describe('optional compact PeriodChart',()=>{
 it.each([false,true])('scales the plot, preserving zero/gap and independent known bar proportions (compact=%s)',compact=>{
  const onSelect=jest.fn();const view=render(<OwnlevelThemeProvider><PeriodChart testID="chart" mode="bars" compact={compact} points={points} inspection={{selectedKey:null,onSelect}}/></OwnlevelThemeProvider>);
  const plotHeight=compact?44:140;
  expect(StyleSheet.flatten(view.getByTestId('chart').props.style).minHeight).toBe(plotHeight+28);
  const heights=view.getByTestId('chart-a-mark').findAll(n=>n.props.style&&StyleSheet.flatten(n.props.style)?.height===plotHeight/2);
  expect(heights.length).toBeGreaterThan(0);
  expect(view.getByTestId('chart-c-zero')).toBeTruthy();expect(view.getByTestId('chart-d-gap')).toBeTruthy();
  for(const b of view.getAllByRole('button')) expect(StyleSheet.flatten(b.props.style).minWidth).toBeGreaterThanOrEqual(44);
  fireEvent.press(view.getByTestId('chart-d-gap'));expect(onSelect).toHaveBeenCalledWith('d');
 });
});
