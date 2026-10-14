/* global jest */
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  const React = require('react');
  return {
    ...mock,
    // Shared values and refs are stable across renders, as on the device.
    makeMutable: initial => ({ value: initial, get() { return this.value; }, set(value) { this.value = value; } }),
    useSharedValue: initial => React.useRef({ value: initial, get() { return this.value; }, set(value) { this.value = value; },
      modify(modifier) { this.value = modifier(this.value); } }).current,
    useAnimatedRef: () => React.useRef(null),
    useFrameCallback: jest.fn(),
    withTiming: jest.fn(value => value),
    withSpring: jest.fn(value => value),
    // Scroll worklets run on JS in tests, receiving the native event as on the device.
    useAnimatedScrollHandler: handler => event => (typeof handler === 'function' ? handler(event.nativeEvent) : handler.onScroll?.(event.nativeEvent)),
  };
});
