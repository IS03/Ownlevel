import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import type { MobileApiClient } from '@/api/client';
import { sessionTemporalDay } from '../../../../src/lib/progress/insights-engine/session-temporal';
import { periodDetailsFixture } from '../../../../src/lib/progress/insights-engine/period-details-fixture';
import { SessionTemporalScreen } from './session-temporal-screen';
import { insightsReturnHref, nutritionDayHref } from './navigation';

jest.mock('@react-native-async-storage/async-storage',()=>jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols',()=>({SymbolView:()=>null}));
const mockPush=jest.fn(),mockNavigate=jest.fn(); let mockParams:Record<string,string>={date:'2026-08-03',revision:'old'};
jest.mock('expo-router',()=>({useLocalSearchParams:()=>mockParams,useRouter:()=>({push:mockPush,navigate:mockNavigate}),useFocusEffect:()=>undefined}));
jest.mock('@/platform/haptics',()=>({haptics:{selection:jest.fn()},triggerHaptic:jest.fn()}));
const mockRead=jest.fn<MobileApiClient['read']>(), mockClient={read:mockRead,request:jest.fn()} as unknown as MobileApiClient;
jest.mock('@/api',()=>({useMobileApi:()=>({client:mockClient})}));
const meta={durationMs:1,httpStatus:200,outcome:'ok' as const};
function body(empty=false) { const source=periodDetailsFixture(); return sessionTemporalDay({...source,sessions:empty?[]:source.sessions,meals:[{...source.meals[0]!,date:'2026-08-03',consumedAt:'2026-08-03T20:00:00-03:00',consumedAtSource:'user_declared',proteinG:null}]},'2026-08-03','2026-08-03T23:30:00Z','new'); }
const serve=()=>mockRead.mockImplementation(async o=>{const data=o.parse(body());expect(data).toBeDefined();return {status:'ok',data,meta} as never;});
const wrap=(mode:'light'|'dark'='light')=><SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:320,height:800},insets:{top:0,left:0,right:0,bottom:0}}}><OwnlevelThemeProvider initialMode={mode}><SessionTemporalScreen/></OwnlevelThemeProvider></SafeAreaProvider>;
beforeEach(()=>{mockRead.mockReset();mockPush.mockReset();mockNavigate.mockReset();mockParams={date:'2026-08-03',revision:'old'};clearConfirmedReads(mockClient);});
it.each(['light','dark'] as const)('reads lazily, shows coverage/provisional and returns from Nutrition to the same day (%s)',async mode=>{
  serve();const view=render(wrap(mode));await view.findByText('Horarios y comidas');
  expect(mockRead).toHaveBeenCalledTimes(1);expect(mockRead.mock.calls[0]![0].path).toContain('date=2026-08-03');
  expect(view.getByTestId('post-provisional')).toBeTruthy();expect(view.getByTestId('temporal-revised')).toBeTruthy();
  expect(view.getByText('0 kcal')).toBeTruthy();expect(view.getAllByText('Sin dato').length).toBeGreaterThan(0);
  fireEvent.press(view.getByRole('button',{name:'Ver Nutrición del 03/08/2026'}));
  const href=nutritionDayHref('2026-08-03',{temporal:'1',date:'2026-08-03',revision:'new'}); expect(mockPush).toHaveBeenLastCalledWith(href);
  expect(insightsReturnHref(href.params)).toEqual({pathname:'/(tabs)/train/insights/temporal',params:{date:'2026-08-03',revision:'new'}});
  fireEvent.press(view.getByRole('button',{name:'Volver al día en Insights'}));expect(mockNavigate).toHaveBeenLastCalledWith({pathname:'/(tabs)/train/insights',params:{date:'2026-08-03'}});
});
it('distinguishes errors, empty and invalid dates and retries without another scope',async()=>{
  mockRead.mockResolvedValueOnce({status:'unavailable',reason:'network',meta:{durationMs:1,httpStatus:null,outcome:'unavailable'}});serve();
  const view=render(wrap());await view.findByText('No pudimos leer el contexto');
  await act(async()=>{fireEvent.press(view.getByRole('button',{name:'Reintentar'}));});expect(view.getByText('Horarios y comidas')).toBeTruthy();
  view.unmount();clearConfirmedReads(mockClient);mockRead.mockImplementation(async o=>({status:'ok',data:o.parse(body(true)),meta}) as never);
  const empty=render(wrap());await empty.findByText('Sin sesiones finalizadas ese día.');empty.unmount();mockRead.mockClear();mockParams={date:'2026-02-30'};
  const invalid=render(wrap());expect(invalid.getByText('No pudimos identificar el día')).toBeTruthy();expect(mockRead).not.toHaveBeenCalled();
});
it('keeps the week revision when returning through temporal context',async()=>{
  mockParams={date:'2026-08-03',revision:'old',explore:'1',asOf:'2026-11-07',week:'2026-08-03',before:'2026-08-04'};
  serve();const view=render(wrap());await view.findByText('Horarios y comidas');
  fireEvent.press(view.getByRole('button',{name:'Volver al día en Insights'}));
  expect(mockNavigate).toHaveBeenLastCalledWith({pathname:'/(tabs)/train/insights',params:mockParams});
});

it('preserves the completed session and revision through Nutrition and returns to its focused facts', async () => {
  const session = '93670000-0000-4000-8000-000000000a01';
  mockParams = { date: '2026-08-03', session, fromSession: '1', revision: 'old' };
  serve(); const view = render(wrap()); await view.findByText('Horarios y comidas');
  fireEvent.press(view.getByRole('button', { name: 'Ver Nutrición del 03/08/2026' }));
  const href = mockPush.mock.calls.at(-1)![0] as { params: Record<string, string> };
  expect(insightsReturnHref(href.params)).toEqual({ pathname: '/(tabs)/train/insights/temporal', params: { date: '2026-08-03', session, fromSession: '1', revision: 'new' } });
  fireEvent.press(view.getByRole('button', { name: 'Volver al día en Insights' }));
  expect(mockNavigate).toHaveBeenLastCalledWith({ pathname: '/(tabs)/train/insights', params: { date: '2026-08-03', session, fromSession: '1', revision: 'old' } });
});
