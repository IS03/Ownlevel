import { useState } from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConfirmationSlot, NoticeHost, NoticeOutlet, OwnlevelThemeProvider, TransientNotice, useConfirmationSlot } from '@/design-system';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const tree = (children: React.ReactNode) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="light">{children}</OwnlevelThemeProvider>
</SafeAreaProvider>;

/** A screen that raises a notice with an Undo bound to its own state, as Inicio and Nutrición do. */
function Screen({ name, testID }: { name: string; testID: string }) {
  const [count, setCount] = useState(1), [shown, setShown] = useState(true);
  return <View testID={testID}>
    <Text>{name}: {count}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Sumar ${name}`} onPress={() => setCount(value => value + 1)} />
    <NoticeOutlet placement="tab">
      {shown ? <TransientNotice testID={`${testID}-notice`} message={`${name}: ${count}`} state="done"
        action={{ label: 'Deshacer', accessibilityLabel: `Deshacer ${name}`, onPress: () => setCount(value => value - 1) }} onDismiss={() => setShown(false)} /> : null}
    </NoticeOutlet>
  </View>;
}

describe('NoticeHost (QA: a confirmation outlives the tab it was raised in)', () => {
  it('shows a screen notice in the host above the tabs, not inside the screen, and keeps it current with its owner', () => {
    const view = render(tree(<NoticeHost><Screen name="Agua" testID="home" /></NoticeHost>));
    const host = within(view.getByTestId('notice-host'));
    expect(host.getByText('Agua: 1')).toBeTruthy();
    expect(within(view.getByTestId('home')).queryByTestId('home-notice')).toBeNull();
    // Its Undo acts on the owner's state, and the host shows the owner's latest notice.
    fireEvent.press(view.getByRole('button', { name: 'Sumar Agua' }));
    expect(host.getByText('Agua: 2')).toBeTruthy();
    fireEvent.press(host.getByRole('button', { name: 'Deshacer Agua' }));
    expect(host.getByText('Agua: 1')).toBeTruthy();
    // Dismissing goes to the owner, which drops it from the host.
    fireEvent.press(view.getByTestId('home-notice-body'));
    expect(view.queryByTestId('home-notice')).toBeNull();
  });
  it('stacks the notices of several owners and drops an owner\'s when it unmounts', () => {
    function Tabs() {
      const [nutrition, setNutrition] = useState(true);
      return <NoticeHost>
        <Screen name="Agua" testID="home" />
        {nutrition ? <Screen name="Banana" testID="nutrition" /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar Nutrición" onPress={() => setNutrition(false)} />
      </NoticeHost>;
    }
    const view = render(tree(<Tabs />));
    const host = within(view.getByTestId('notice-host'));
    expect(host.getByText('Agua: 1')).toBeTruthy(); expect(host.getByText('Banana: 1')).toBeTruthy();
    act(() => { fireEvent.press(view.getByRole('button', { name: 'Cerrar Nutrición' })); });
    expect(host.queryByText('Banana: 1')).toBeNull(); expect(host.getByText('Agua: 1')).toBeTruthy();
  });
  it('without a host (a screen on its own) the notices stay in place, in the same stack', () => {
    const view = render(tree(<Screen name="Agua" testID="home" />));
    expect(view.queryByTestId('notice-host')).toBeNull();
    expect(within(view.getByTestId('home')).getByTestId('home-notice')).toBeTruthy();
  });
});

/** An owner of one saving confirmation (a metric or a meal hook): a new save replaces its own, and the shared place arbitrates. */
function Owner({ name, testID }: { name: string; testID: string }) {
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  const [hidden, setHidden] = useState(false);
  useConfirmationSlot(notice ? `${testID}:${notice.id}` : null, () => setNotice(null));
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Guardar ${name}`} onPress={() => setNotice(value => ({ id: (value?.id ?? 0) + 1, text: `${name} ${(value?.id ?? 0) + 1}` }))} />
    <Pressable accessibilityRole="button" accessibilityLabel={`Ocultar ${name}`} onPress={() => setHidden(value => !value)} />
    <NoticeOutlet placement="tab">
      {notice && !hidden ? <TransientNotice key={notice.id} testID={`${testID}-notice`} message={notice.text} state="done" onDismiss={() => setNotice(null)} /> : null}
    </NoticeOutlet>
  </View>;
}

describe('#635 one saving confirmation across Inicio and Nutrición', () => {
  const press = (view: ReturnType<typeof render>, name: string) => fireEvent.press(view.getByRole('button', { name }));
  const setup = () => render(tree(<NoticeHost><Owner name="Agua" testID="home" /><Owner name="Pasos" testID="metric" /><Owner name="Pasta" testID="meal" /></NoticeHost>));
  it('a newer confirmation of another owner retires the previous one for good', () => {
    const view = setup();
    press(view, 'Guardar Agua'); expect(view.getByLabelText('Agua 1')).toBeTruthy();
    press(view, 'Guardar Pasos'); expect(view.queryByLabelText('Agua 1')).toBeNull(); expect(view.getByLabelText('Pasos 1')).toBeTruthy();
    press(view, 'Guardar Pasta'); expect(view.queryByLabelText('Pasos 1')).toBeNull(); expect(view.getByLabelText('Pasta 1'));
    // Closing the newest reveals nothing.
    act(() => { fireEvent(view.getByLabelText('Pasta 1'), 'accessibilityAction', { nativeEvent: { actionName: 'dismiss' } }); });
    expect(within(view.getByTestId('notice-host')).queryByText(/Agua|Pasos|Pasta/)).toBeNull();
  });
  it('the same owner replaces its own; a hidden one shown again never retires a newer one', () => {
    const view = setup();
    press(view, 'Guardar Agua'); press(view, 'Guardar Agua'); expect(view.queryByLabelText('Agua 1')).toBeNull(); expect(view.getByLabelText('Agua 2')).toBeTruthy();
    press(view, 'Guardar Pasta'); press(view, 'Ocultar Pasta'); press(view, 'Ocultar Pasta');
    expect(view.getByLabelText('Pasta 1')).toBeTruthy(); expect(view.queryByLabelText('Agua 2')).toBeNull();
    press(view, 'Ocultar Pasta'); press(view, 'Guardar Pasos'); press(view, 'Ocultar Pasta');
    expect(view.queryByLabelText('Pasta 1')).toBeNull(); expect(view.getByLabelText('Pasos 1')).toBeTruthy();
  });
  it('an owner leaving (another account, its tab gone) frees the place without touching the others', () => {
    const slot = new ConfirmationSlot(), retired: string[] = [];
    slot.claim('home', 'a', () => retired.push('home')); slot.release('home');
    slot.claim('meal', 'b', () => retired.push('meal')); expect(retired).toEqual([]);
    slot.claim('meal', 'c', () => retired.push('meal')); expect(retired).toEqual([]);
    slot.claim('home', 'd', () => retired.push('home')); expect(retired).toEqual(['meal']);
  });
});
