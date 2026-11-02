// Native presentation intent, kept independent of UIKit so transition races can be tested without UI.
struct NextSessionPresentation {
  enum Phase { case closed, presenting, open, dismissing }
  private(set) var phase: Phase = .closed
  private(set) var wantsPresented = false
  private var lastRequest = 0

  var acceptsContentUpdates: Bool { phase == .open && wantsPresented }

  mutating func toggle(request: Int) {
    guard request > lastRequest else { return }
    let toggles = request - lastRequest
    lastRequest = request
    if !toggles.isMultiple(of: 2) { wantsPresented.toggle() }
  }

  mutating func close() { wantsPresented = false }

  mutating func beginPresentation() -> Bool {
    guard phase == .closed, wantsPresented else { return false }
    phase = .presenting
    return true
  }

  mutating func didAppear() -> Bool {
    guard phase == .presenting else { return false }
    phase = .open
    return true
  }

  mutating func beginDismissal() -> Bool {
    guard phase == .open, !wantsPresented else { return false }
    phase = .dismissing
    return true
  }

  mutating func willDismissFromOutside() {
    // A duplicate UIKit callback must not erase a tap queued during the same dismissal.
    guard phase != .closed, phase != .dismissing else { return }
    wantsPresented = false
    phase = .dismissing
  }

  mutating func didDisappear() -> Bool {
    guard phase != .closed else { return false }
    // UIKit may remove the host without a preceding adaptive/popover delegate callback.
    if phase != .dismissing { wantsPresented = false }
    phase = .closed
    return true
  }
}

// UIKit/SwiftUI must reflect the gesture before React commits the corresponding prop update.
struct NextSessionApplyState {
  private(set) var value: Bool
  private var lastProp: Bool

  init(_ value: Bool) { self.value = value; lastProp = value }

  mutating func change(_ value: Bool) -> Bool {
    guard self.value != value else { return false }
    self.value = value
    return true
  }

  mutating func receive(_ value: Bool) {
    guard value != lastProp else { return }
    lastProp = value
    self.value = value
  }
}
