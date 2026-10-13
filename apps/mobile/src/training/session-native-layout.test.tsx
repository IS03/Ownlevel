import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { Text, TextInput, View } from 'react-native';
import { NativeReorderItem, NativeReorderList } from './session-native-interactions';

function Rows({ ids = ['first', 'second'] }: { ids?: string[] }) {
  return <View>
    <Text># / KG / REPS / RIR / ✓</Text>
    <NativeReorderList ids={ids} onLift={() => true} onDrop={async () => true} onCancel={jest.fn()}>
      {ids.map(id => <NativeReorderItem key={id} id={id}><View><TextInput accessibilityLabel={`Peso ${id}`} value="40" /><Text>{id}</Text></View></NativeReorderItem>)}
    </NativeReorderList>
    <Text>+ Agregar serie</Text>
  </View>;
}
describe('series visibility with incomplete native layout measurements', () => {
  it('never hides all rows while one height is missing and another reserves space', () => {
    const view = render(<Rows />);
    fireEvent(view.getByTestId('drag-item-first'), 'layout', { nativeEvent: { layout: { height: 80 } } });
    // Native onLayout is asynchronous: the second measurement has not arrived.
    view.rerender(<Rows />);
    expect(view.getByText('# / KG / REPS / RIR / ✓')).toBeVisible();
    expect(view.getByText('+ Agregar serie')).toBeVisible();
    expect(view.getByLabelText('Peso first')).toBeVisible();
    expect(view.getByLabelText('Peso second')).toBeVisible();
  });
  it('shows an appended expanded exercise before its native measurement arrives', () => {
    const view = render(<Rows />);
    for (const id of ['first', 'second']) fireEvent(view.getByTestId(`drag-item-${id}`), 'layout', { nativeEvent: { layout: { height: 80 } } });
    view.rerender(<Rows ids={['first', 'second', 'added']} />);
    expect(view.getByLabelText('Peso first')).toBeVisible(); expect(view.getByLabelText('Peso added')).toBeVisible();
    fireEvent(view.getByTestId('drag-item-added'), 'layout', { nativeEvent: { layout: { height: 520 } } });
    expect(view.getByLabelText('Peso added')).toBeVisible(); expect(view.getByText('+ Agregar serie')).toBeVisible();
  });
  it('keeps remounted reconciliation rows visible before their replacement IDs are measured', () => {
    const view = render(<Rows />);
    for (const id of ['first', 'second']) fireEvent(view.getByTestId(`drag-item-${id}`), 'layout', { nativeEvent: { layout: { height: 80 } } });
    view.rerender(<Rows ids={['fresh-first', 'fresh-second']} />);
    view.rerender(<Rows ids={['fresh-first', 'fresh-second']} />);
    expect(view.getByLabelText('Peso fresh-first')).toBeVisible();
    expect(view.getByLabelText('Peso fresh-second')).toBeVisible();
  });
});
