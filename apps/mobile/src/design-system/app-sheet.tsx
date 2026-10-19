import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Keyboard, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { motion } from './brand';
import { useReduceMotion } from './motion';
import { SheetHandle } from './sheet';
import { KeyboardSheetMotion } from './keyboard-sheet-motion';

/** Closes the sheet with its exit animation, then runs `after` once it is gone. */
export type AppSheetDismiss = (after?: () => void) => void;
const DismissContext = createContext<AppSheetDismiss | null>(null);
/** The enclosing AppSheet's animated close (for close buttons inside the content). */
export function useAppSheetDismiss(): AppSheetDismiss {
  const dismiss = useContext(DismissContext);
  if (!dismiss) throw new Error('useAppSheetDismiss must be used inside an AppSheet');
  return dismiss;
}

const TIMING = { duration: motion.duration.base, easing: Easing.bezier(...motion.easing) };

type AppSheetProps = PropsWithChildren<{
  onClose: () => void;
  /** Accessibility label of the backdrop. */
  closeLabel: string;
  /** While true (a save in flight) the sheet cannot be dismissed. */
  locked?: boolean;
  /** The whole sheet follows a downward drag; otherwise only the handle area does (scrollable content). */
  dragFromContent?: boolean;
  /** Also closes with a swipe from the left edge (like going back). */
  edgeSwipe?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Confirm discarding an unsaved form before starting any exit (including a drag/backdrop). */
  beforeDismiss?: (proceed: () => void) => void;
  /** Dismiss the keyboard at the start of an accepted exit, holding sheet geometry until it is gone. */
  dismissKeyboardOnClose?: boolean;
  /** iOS: UIKit focuses the first input and owns the entire keyboard/sheet entrance and exit. */
  nativeKeyboard?: boolean;
  /** iOS nativeKeyboard only: cap the scrollable form above the keyboard and below the top safe area. */
  keyboardViewport?: boolean;
  keyboardTopInset?: number;
  keyboardInset?: number;
  /** Runs once the sheet is presented and measured (focus an input here). */
  onShow?: () => void;
}>;

/**
 * App-drawn bottom sheet: it slides in and leaves the same way (IDENTIDAD.md § Movimiento, 300 ms), follows a
 * drag down and closes from the backdrop. With Reduce Motion it only fades.
 */
export function AppSheet({ children, onClose, closeLabel, locked = false, dragFromContent = false, edgeSwipe = false, style, testID, beforeDismiss, dismissKeyboardOnClose = false, nativeKeyboard = false, keyboardViewport = false, keyboardTopInset = 0, keyboardInset = 0, onShow }: AppSheetProps) {
  const reduced = useReduceMotion();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [gone, setGone] = useState(false);
  const [after, setAfter] = useState<{ run?: () => void }>({});
  const [nativePresentation, setNativePresentation] = useState({ height: 0, presented: false, closing: false });
  const followsKeyboard = nativeKeyboard && Platform.OS === 'ios';
  const shown = useSharedValue(0), closing = useSharedValue(false);
  const offset = useSharedValue(windowHeight), sheetHeight = useSharedValue(windowHeight), sideways = useSharedValue(0);
  const measured = useRef(false);
  const nativeShown = useRef(false), notifiedShown = useRef(false);
  const notifyShown = () => {
    if (!nativeShown.current || !measured.current || notifiedShown.current) return;
    notifiedShown.current = true;
    onShow?.();
    if (!followsKeyboard && onShow) offset.set(reduced ? 0 : withTiming(0, TIMING));
  };

  const finish = useCallback(() => { onClose(); after.run?.(); }, [after, onClose]);
  // iOS must finish removing the Modal before a next one is presented (the `after` action may open one):
  // the Modal's onDismiss calls finish there. Elsewhere it runs once the exit is done.
  useEffect(() => { if (gone && Platform.OS !== 'ios') finish(); }, [finish, gone]);
  const hide = useCallback(() => setGone(true), []);
  const leave = useCallback((next: (() => void) | undefined, toSide: boolean) => {
    if (closing.get() || locked) return;
    closing.set(true);
    setAfter({ run: next });
    if (followsKeyboard) {
      // UIKit dismisses the input and moves the sheet in the same native transaction.
      setNativePresentation(value => ({ ...value, closing: true }));
      shown.set(withTiming(0, TIMING));
      return;
    }
    if (dismissKeyboardOnClose) Keyboard.dismiss();
    // Reduce Motion: the backdrop fades and the sheet leaves without sliding.
    shown.set(withTiming(0, TIMING, done => { if (done && reduced) runOnJS(hide)(); }));
    if (reduced) return;
    // A swipe from the edge leaves sideways, the way it was pulled; everything else slides down.
    if (toSide) sideways.set(withTiming(windowWidth, TIMING, done => { if (done) runOnJS(hide)(); }));
    else offset.set(withTiming(sheetHeight.get(), TIMING, done => { if (done) runOnJS(hide)(); }));
  }, [closing, dismissKeyboardOnClose, followsKeyboard, hide, locked, offset, reduced, sheetHeight, shown, sideways, windowWidth]);
  const requestLeave = useCallback((next: (() => void) | undefined, side: boolean) => {
    if (locked) return;
    if (beforeDismiss && !next) {
      // A drag past the threshold returns home while the confirmation is up; "keep editing" leaves it in place.
      offset.set(reduced ? 0 : withSpring(0, motion.spring));
      sideways.set(reduced ? 0 : withSpring(0, motion.spring));
      beforeDismiss(() => leave(undefined, side));
    } else leave(next, side);
  }, [beforeDismiss, leave, locked, offset, reduced, sideways]);
  const dismiss = useCallback<AppSheetDismiss>(next => requestLeave(next, false), [requestLeave]);
  const dismissSideways = useCallback(() => requestLeave(undefined, true), [requestLeave]);

  useEffect(() => { shown.set(withTiming(1, TIMING)); }, [shown]);

  const pan = useMemo(() => Gesture.Pan().withTestId(`${testID ?? 'app-sheet'}-pan`).enabled(!locked).activeOffsetY(8).failOffsetX([-24, 24])
    .onUpdate(event => { if (!closing.value) offset.set(reduced ? 0 : Math.max(0, event.translationY)); })
    .onEnd(event => {
      if (event.translationY > sheetHeight.value * 0.25 || event.velocityY > 900) runOnJS(dismiss)();
      else offset.set(reduced ? 0 : withSpring(0, motion.spring));
    }), [closing, dismiss, locked, offset, reduced, sheetHeight, testID]);
  const edge = useMemo(() => Gesture.Pan().enabled(edgeSwipe && !locked).hitSlop({ left: 0, width: 28 }).activeOffsetX(10).failOffsetY([-20, 20])
    .onUpdate(event => { sideways.set(Math.max(0, event.translationX)); })
    .onEnd(event => {
      if (event.translationX > windowWidth * 0.3 || event.velocityX > 800) runOnJS(dismissSideways)();
      else sideways.set(withSpring(0, motion.spring));
    }), [dismissSideways, edgeSwipe, locked, sideways, windowWidth]);

  const scrim = useAnimatedStyle(() => ({ opacity: shown.value }));
  // Never an opacity on the sheet: iOS Liquid Glass inside it (close buttons) does not render under a faded parent.
  // Until measured it waits off screen, one window below.
  const sheet = useAnimatedStyle(() => ({
    // Android's avoiding view still resizes; iOS follows the keyboard by translation only.
    ...(dismissKeyboardOnClose && !followsKeyboard && closing.value ? { height: sheetHeight.value } : {}),
    transform: [{ translateY: reduced ? 0 : offset.value }, { translateX: reduced ? 0 : sideways.value }],
  }));

  const grabber = <View style={styles.grabber}><SheetHandle /></View>;
  const body = <Animated.View accessibilityViewIsModal onLayout={event => {
    const next = event.nativeEvent.layout.height;
    if (closing.get()) return;
    sheetHeight.set(next);
    if (followsKeyboard) setNativePresentation(value => value.height === next ? value : { ...value, height: next });
    if (measured.current) return;
    measured.current = true;
    offset.set(reduced || followsKeyboard ? 0 : next);
    if (!followsKeyboard && !onShow) offset.set(reduced ? 0 : withTiming(0, TIMING));
    notifyShown();
  }} style={[styles.sheet, style, followsKeyboard && styles.keyboardSheet, sheet]} testID={testID}>
    {followsKeyboard ? <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      testID={testID ? `${testID}-keyboard-tail` : 'sheet-keyboard-tail'}
      style={{ position: 'absolute', top: '100%', left: 0, right: 0, height: windowHeight, backgroundColor: StyleSheet.flatten(style)?.backgroundColor }} /> : null}
    {dragFromContent ? grabber : <GestureDetector gesture={pan}>{grabber}</GestureDetector>}
    {children}
  </Animated.View>;

  const draggableBody = <GestureDetector gesture={dragFromContent ? Gesture.Simultaneous(pan, edge) : edge}>{body}</GestureDetector>;
  return <Modal transparent statusBarTranslucent animationType="none" visible={!gone} onShow={() => {
    nativeShown.current = true;
    if (followsKeyboard) setNativePresentation(value => ({ ...value, presented: true }));
    notifyShown();
  }} onDismiss={finish} onRequestClose={() => dismiss()} testID={testID ? `${testID}-modal` : undefined}>
    <GestureHandlerRootView style={styles.fill}>
      <DismissContext.Provider value={dismiss}>
        <View style={styles.fill}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]}>
            <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} disabled={locked} onPress={() => dismiss()} style={StyleSheet.absoluteFill} />
          </Animated.View>
          {followsKeyboard ? <KeyboardSheetMotion pointerEvents="box-none"
            style={keyboardViewport ? { height: Math.max(0, windowHeight - keyboardTopInset), justifyContent: 'flex-end' } : styles.fill}
            sheetHeight={nativePresentation.height} presented={nativePresentation.presented} closing={nativePresentation.closing}
            {...(keyboardViewport ? { boundedViewport: true, topInset: keyboardTopInset } : {})}
            bottomInset={keyboardInset} reduceMotion={reduced} onClosed={hide}>{draggableBody}</KeyboardSheetMotion> : draggableBody}
        </View>
      </DismissContext.Provider>
    </GestureHandlerRootView>
  </Modal>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  keyboardSheet: { overflow: 'visible' },
  grabber: { paddingTop: 8, paddingBottom: 4, alignItems: 'center' },
});
