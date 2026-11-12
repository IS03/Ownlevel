import { act, fireEvent, render } from '@testing-library/react-native';
import { afterEach, expect, it, jest } from '@jest/globals';
import * as RN from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { State, GestureHandlerRootView } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { OwnlevelThemeProvider, brandTokens } from '@/design-system';
import { MetricSavedNotice } from './metric-notice';
import type { MetricNotice } from './use-metric-entry';

jest.mock('expo-symbols',()=>({SymbolView:()=>null}));
afterEach(()=>{jest.restoreAllMocks();});
const open=(mode:'light'|'dark'='light',pending=false,disabled=false)=>{
 const close=jest.fn(),undo=jest.fn(),previous=jest.fn();
 const view=render(<GestureHandlerRootView><SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:320,height:700},insets:{top:44,bottom:34,left:0,right:0}}}><OwnlevelThemeProvider initialMode={mode}>
  <MetricSavedNotice notice={{date:'2026-11-07',message:pending?'Deshaciendo…':'Agua: 0,5 L',undo:null,queuedCount:1}} pending={pending} disabled={disabled} onClose={close} onUndo={undo} onPrevious={previous}/>
 </OwnlevelThemeProvider></SafeAreaProvider></GestureHandlerRootView>);
 return {view,close,undo,previous};
};
it.each(['light','dark'] as const)('has no X, supports accessible dismissal and keeps the dock outside the tab bar (%s)',mode=>{
 const announcement=jest.spyOn(RN.AccessibilityInfo,'announceForAccessibility');
 const {view,close,previous}=open(mode);
 expect(announcement).toHaveBeenCalledWith('Agua: 0,5 L');
 expect(view.queryByRole('button',{name:'Cerrar aviso de métrica'})).toBeNull();
 const dock=view.getByTestId('nutrition-metric-notice');expect(dock.props.pointerEvents).toBe('box-none');
 expect(RN.StyleSheet.flatten(dock.props.style).bottom).toBeGreaterThanOrEqual(brandTokens.layout.tabBarHeight+brandTokens.layout.tabBarInset);
 fireEvent.press(view.getByRole('button',{name:'Ver confirmación anterior, 1 disponibles'}));expect(previous).toHaveBeenCalledTimes(1);
 fireEvent(view.getByLabelText('Agua: 0,5 L'),'accessibilityAction',{nativeEvent:{actionName:'dismiss'}});expect(close).toHaveBeenCalledTimes(1);
});
it('runs a downward gesture callback, ignores a short/upward motion and keeps pending non-dismissible',()=>{
 const {view,close}=open();const gesture=getByGestureTestId('metric-notice-dismiss');
 act(()=>fireGestureHandler(gesture,[{state:State.BEGAN,translationY:0,translationX:0},{state:State.ACTIVE,translationY:12,translationX:0},{state:State.END,translationY:12,translationX:0}]));expect(close).not.toHaveBeenCalled();
 act(()=>fireGestureHandler(gesture,[{state:State.BEGAN,translationY:0,translationX:0},{state:State.ACTIVE,translationY:60,translationX:0},{state:State.END,translationY:60,translationX:0}]));expect(close).toHaveBeenCalledTimes(1);
 view.unmount();const pending=open('dark',true);expect(pending.view.getByText('Deshaciendo…')).toBeTruthy();expect(pending.view.queryByLabelText('Agua: 0,5 L')).toBeNull();expect(pending.view.queryByRole('button',{name:/Anterior|Cerrar/})).toBeNull();
});
it('keeps large text untruncated and disables dismissal when interaction is locked',()=>{
 jest.spyOn(RN,'useWindowDimensions').mockReturnValue({width:320,height:700,fontScale:1.6,scale:3});
 const {view,close}=open('dark',false,true);const message=view.getByLabelText('Agua: 0,5 L');
 expect(message.props.numberOfLines).toBeUndefined();expect(message.props.allowFontScaling).not.toBe(false);
 fireEvent(message,'accessibilityAction',{nativeEvent:{actionName:'dismiss'}});expect(close).not.toHaveBeenCalled();
});
it('a swipe over a confirmation with Deshacer and Anterior only dismisses: neither the undo nor the previous slot runs',()=>{
 const close=jest.fn(),undo=jest.fn(),previous=jest.fn();
 render(<GestureHandlerRootView><SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:320,height:700},insets:{top:44,bottom:34,left:0,right:0}}}><OwnlevelThemeProvider initialMode="light">
  <MetricSavedNotice notice={{date:'2026-11-07',message:'Agua: 0,5 L',undo:{} as unknown as NonNullable<MetricNotice['undo']>,queuedCount:2}} disabled={false} onClose={close} onUndo={undo} onPrevious={previous}/>
 </OwnlevelThemeProvider></SafeAreaProvider></GestureHandlerRootView>);
 const gesture=getByGestureTestId('metric-notice-dismiss');
 act(()=>fireGestureHandler(gesture,[{state:State.BEGAN,translationY:0,translationX:0},{state:State.ACTIVE,translationY:90,translationX:0},{state:State.END,translationY:90,translationX:0}]));
 expect(close).toHaveBeenCalledTimes(1);expect(undo).not.toHaveBeenCalled();expect(previous).not.toHaveBeenCalled();
});
