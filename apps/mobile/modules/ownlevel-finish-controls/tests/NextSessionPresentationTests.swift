// Compile with the production NextSessionPresentation.swift. No UIKit or mocked native view.
@main
enum NextSessionPresentationTests {
  static func expect(_ value: Bool, _ message: String, line: UInt = #line) {
    precondition(value, "line \(line): \(message)")
  }

  static func opened() -> NextSessionPresentation {
    var state = NextSessionPresentation()
    state.toggle(request: 1)
    expect(state.beginPresentation(), "first activation opens")
    expect(!state.acceptsContentUpdates, "do not replace SwiftUI content during presentation")
    expect(state.didAppear(), "native appearance completes opening")
    return state
  }

  static func main() {
    // React prop echoes and duplicate native appearance notifications do not close or reopen it.
    var state = opened()
    state.toggle(request: 1)
    expect(!state.didAppear(), "appearance completion is idempotent")
    expect(state.acceptsContentUpdates, "open content can receive switch changes")
    expect(!state.beginDismissal(), "unchanged intent leaves the panel open")

    // Close while opening: finish that native transition, then dismiss without rewriting the root.
    state = NextSessionPresentation()
    state.toggle(request: 1)
    expect(state.beginPresentation(), "open before a rapid second tap")
    state.toggle(request: 2)
    expect(!state.beginDismissal(), "wait for actual appearance rather than a timer")
    expect(state.didAppear(), "presentation ends")
    expect(!state.acceptsContentUpdates, "queued close must not replace the SwiftUI root")
    expect(state.beginDismissal(), "second activation closes")
    expect(state.didDisappear(), "native disappearance completes closing")
    expect(!state.wantsPresented && state.phase == .closed, "stay closed")

    // Coalesced React updates retain every activation's parity; old requests never replay.
    state = NextSessionPresentation()
    state.toggle(request: 2)
    expect(!state.beginPresentation(), "two coalesced taps cancel")
    state.toggle(request: 1)
    state.toggle(request: 2)
    expect(!state.wantsPresented, "old and repeated requests are ignored")
    state.toggle(request: 5)
    expect(state.beginPresentation(), "three further activations request opening")

    // A single tap received during dismissal opens once that real dismissal has finished.
    state = opened()
    state.toggle(request: 2)
    expect(state.beginDismissal(), "trigger requests close")
    state.toggle(request: 3)
    expect(!state.beginPresentation(), "never present over an unfinished dismissal")
    expect(state.didDisappear(), "dismissal finishes")
    expect(state.beginPresentation(), "one queued activation is enough to reopen")
    expect(state.didAppear(), "reopening finishes")

    // Adaptive and popover delegates can report the same outside dismissal more than once.
    state = opened()
    state.willDismissFromOutside()
    state.toggle(request: 2)
    state.willDismissFromOutside()
    expect(state.wantsPresented, "duplicate outside callbacks preserve the queued reopen")
    expect(!state.didAppear(), "late appearance callback cannot overwrite dismissal")
    expect(state.didDisappear(), "outside dismissal finishes")
    expect(state.beginPresentation(), "reopen after outside close")

    // Host disappearance is also authoritative when an adaptive/popover callback is absent.
    state = opened()
    expect(state.didDisappear(), "host lifecycle can finalize dismissal")
    expect(!state.wantsPresented, "an old open intent must not resurrect a disappeared host")
    expect(!state.beginPresentation(), "outside close stays closed")
    state.toggle(request: 2)
    expect(!state.didDisappear(), "duplicate disappearance does not erase a fresh activation")
    expect(state.beginPresentation(), "one valid activation reopens")

    // Selection/escape/editability loss request close; content stays frozen throughout dismissal.
    state = opened()
    state.close()
    expect(!state.acceptsContentUpdates, "a decision update must not replace the closing root")
    expect(state.beginDismissal(), "explicit close starts native dismissal")
    expect(!state.acceptsContentUpdates, "no content update during dismissal")
    expect(state.didDisappear(), "explicit close completes")
    expect(!state.acceptsContentUpdates, "closed host cannot receive content updates")

    // A delayed/unchanged React prop cannot roll back a native switch gesture.
    var apply = NextSessionApplyState(false)
    expect(apply.change(true), "native switch updates immediately")
    apply.receive(false)
    expect(apply.value, "old prop echo does not undo the gesture")
    apply.receive(true)
    expect(apply.value, "React acknowledgement keeps the current value")
    expect(apply.change(false), "second native change updates immediately")
    apply.receive(true)
    expect(!apply.value, "old acknowledgement does not undo the second gesture")
    apply.receive(false)
    expect(!apply.value, "second acknowledgement agrees")

    apply = NextSessionApplyState(true)
    apply.receive(false)
    expect(!apply.value, "an actual external prop change is still adopted")
    apply.receive(false)
    expect(!apply.value, "duplicate props are harmless")

    expect(apply.change(true), "changed value emits an event")
    expect(!apply.change(true), "same-value native events do not duplicate the callback")
    print("10 native presentation/switch scenarios passed; gestures are not exercised")
  }
}
