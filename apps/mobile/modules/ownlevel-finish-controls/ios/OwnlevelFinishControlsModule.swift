import ExpoModulesCore
import UIKit
import SwiftUI

public final class OwnlevelFinishControlsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OwnlevelFinishControls")
    View(NextSessionOptionsView.self) {
      Events("onPresentationChange", "onDecision", "onApply")
      Prop("openRequest") { (view, value: Int) in view.requestOpen(value) }
      Prop("editable") { (view, value: Bool) in view.editable = value }
      Prop("name") { (view, value: String) in view.name = value }
      Prop("decision") { (view, value: String) in view.decision = value }
      Prop("decisionNote") { (view, value: String) in view.decisionNote = value }
      Prop("applyToRoutine") { (view, value: Bool) in view.applyToRoutine = value }
      Prop("applyLabel") { (view, value: String?) in view.applyLabel = value }
      Prop("extra") { (view, value: Bool) in view.extra = value }
      Prop("isDark") { (view, value: Bool) in view.overrideUserInterfaceStyle = value ? .dark : .light }
      Prop("accent") { (view, value: UIColor) in view.accent = value }
      Prop("muted") { (view, value: UIColor) in view.muted = value }
      Prop("contentPadding") { (view, value: Double) in view.contentPadding = value }
      Prop("contentSpacing") { (view, value: Double) in view.contentSpacing = value }
      Prop("minTouch") { (view, value: Double) in view.minTouch = value }
      OnViewDidUpdateProps { (view: NextSessionOptionsView) in view.refresh() }
    }
    View(FinishScaleView.self) {
      Events("onValueCommit")
      Prop("value") { (view, value: Int?) in view.control.selectedSegmentIndex = value.map { $0 - 1 } ?? UISegmentedControl.noSegment }
      Prop("disabled") { (view, value: Bool) in view.control.isEnabled = !value }
      Prop("label") { (view, value: String) in view.control.accessibilityLabel = value }
      Prop("accent") { (view, value: UIColor?) in view.control.setTitleTextAttributes([.foregroundColor: value ?? UIColor.label], for: .selected) }
      Prop("isDark") { (view, value: Bool) in view.overrideUserInterfaceStyle = value ? .dark : .light }
    }
    View(FinishPainView.self) {
      Events("onValueCommit")
      Prop("value") { (view, value: Int?) in view.apply(value) }
      Prop("disabled") { (view, value: Bool) in view.control.isEnabled = !value }
      Prop("accent") { (view, value: UIColor?) in view.accent = value ?? .label; view.updateAppearance() }
      Prop("trackColor") { (view, value: UIColor?) in view.control.maximumTrackTintColor = value }
      Prop("isDark") { (view, value: Bool) in view.overrideUserInterfaceStyle = value ? .dark : .light }
    }
  }
}

final class OptionalSegments: UISegmentedControl, UIGestureRecognizerDelegate {
  private var before = UISegmentedControl.noSegment
  override init(items: [Any]?) {
    super.init(items: items)
    let tap = UITapGestureRecognizer(target: self, action: #selector(tappedAgain(_:)))
    tap.cancelsTouchesInView = false
    tap.delegate = self
    addGestureRecognizer(tap)
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    before = selectedSegmentIndex
    return true
  }
  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
  @objc private func tappedAgain(_ tap: UITapGestureRecognizer) {
    let x = tap.location(in: self).x
    let logicalX = effectiveUserInterfaceLayoutDirection == .rightToLeft ? bounds.width - x : x
    let index = min(numberOfSegments - 1, max(0, Int(logicalX / max(1, bounds.width) * CGFloat(numberOfSegments))))
    guard before >= 0, index == before else { return }
    // UIKit's internal segment tracking finishes first, including on Liquid Glass.
    DispatchQueue.main.async { [weak self] in
      guard let self, self.selectedSegmentIndex == index else { return }
      self.selectedSegmentIndex = UISegmentedControl.noSegment
      self.sendActions(for: .valueChanged)
    }
  }
}
public final class FinishScaleView: ExpoView {
  let control = OptionalSegments(items: ["1", "2", "3", "4", "5"])
  let onValueCommit = EventDispatcher()
  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    control.selectedSegmentIndex = UISegmentedControl.noSegment
    control.addTarget(self, action: #selector(changed), for: .valueChanged)
    control.setTitleTextAttributes([.font: UIFont.preferredFont(forTextStyle: .body)], for: .normal)
    addSubview(control)
  }
  public override func layoutSubviews() { super.layoutSubviews(); control.frame = bounds.insetBy(dx: 0, dy: 4) }
  @objc private func changed() { onValueCommit(["value": control.selectedSegmentIndex < 0 ? NSNull() : control.selectedSegmentIndex + 1]) }
}

final class NumberedSlider: UISlider {
  var onBegin: ((UITouch) -> Void)?
  override func beginTracking(_ touch: UITouch, with event: UIEvent?) -> Bool {
    onBegin?(touch)
    return super.beginTracking(touch, with: event)
  }
}
public final class FinishPainView: ExpoView {
  let control = NumberedSlider()
  let onValueCommit = EventDispatcher()
  let number = UILabel()
  var accent = UIColor.label
  private var answered = false
  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
    control.minimumValue = 0; control.maximumValue = 10
    control.accessibilityLabel = "Dolor, de 0 a 10"
    number.font = UIFontMetrics(forTextStyle: .caption1).scaledFont(for: .monospacedDigitSystemFont(ofSize: 13, weight: .semibold))
    number.adjustsFontForContentSizeCategory = true
    number.textAlignment = .center; number.isUserInteractionEnabled = false; number.isAccessibilityElement = false
    control.addTarget(self, action: #selector(moved), for: .valueChanged)
    control.addTarget(self, action: #selector(committed), for: [.touchUpInside, .touchUpOutside, .touchCancel])
    control.onBegin = { [weak self] touch in
      guard let self else { return }
      self.answered = true
      self.updateAppearance()
      let track = self.control.trackRect(forBounds: self.control.bounds)
      let thumb = self.control.thumbRect(forBounds: self.control.bounds, trackRect: track, value: self.control.value)
      let fraction = min(1, max(0, (touch.location(in: self.control).x - thumb.width / 2) / max(1, self.control.bounds.width - thumb.width)))
      self.control.value = Float(fraction * 10)
      self.updateAppearance()
    }
    addSubview(control); control.addSubview(number); updateAppearance()
  }
  func apply(_ value: Int?) {
    guard !control.isTracking else { return } // Delayed JS must never pull a moving thumb backwards.
    answered = value != nil; control.value = Float(value ?? 0); updateAppearance()
  }
  public override func layoutSubviews() { super.layoutSubviews(); control.frame = bounds; positionNumber() }
  private var styledAnswered: Bool?
  private var styledAccent: UIColor?
  func updateAppearance() {
    // Restyling the thumb on every drag tick resets the Liquid Glass thumb and makes it stutter:
    // touch the track/thumb only when the answered state or accent actually changes.
    if styledAnswered != answered || styledAccent != accent {
      styledAnswered = answered; styledAccent = accent
      control.minimumTrackTintColor = answered ? accent : .clear
      control.setThumbImage(answered ? nil : UIImage(), for: .normal)
      number.isHidden = !answered; number.textColor = accent
    }
    number.text = "\(Int(control.value.rounded()))"
    control.accessibilityValue = answered ? "\(Int(control.value.rounded())) de 10" : "Sin responder"
    positionNumber()
  }
  private func positionNumber() {
    let thumb = control.thumbRect(forBounds: control.bounds, trackRect: control.trackRect(forBounds: control.bounds), value: control.value)
    number.frame = CGRect(x: thumb.midX - 20, y: thumb.midY - 20, width: 40, height: 40)
    control.bringSubviewToFront(number)
  }
  @objc private func moved() {
    answered = true; updateAppearance()
    if !control.isTracking { committed() } // VoiceOver adjustments do not produce touch-up events.
  }
  @objc private func committed() {
    answered = true; control.value = control.value.rounded(); updateAppearance()
    onValueCommit(["value": Int(control.value)]) // One JS draft update per completed gesture.
  }
}


/** Presentation requests are independent of React's observed open/closed state. */
public final class NextSessionOptionsView: ExpoView, UIPopoverPresentationControllerDelegate {
  let onPresentationChange = EventDispatcher()
  let onDecision = EventDispatcher()
  let onApply = EventDispatcher()
  var editable = true
  var name = "", decision = "maintain", decisionNote = ""
  var applyToRoutine = false, extra = false
  var applyLabel: String?
  var accent = UIColor.label, muted = UIColor.secondaryLabel
  var contentPadding = 0.0, contentSpacing = 0.0, minTouch = 0.0
  private var lastRequest = 0
  private var wantsOpen = false
  private var dismissing = false
  private var presenting = false
  private var closeAfterPresentation = false
  private lazy var outsideControl: NextSessionOutsideControl = {
    let control = NextSessionOutsideControl()
    control.accessibilityLabel = "Cerrar opciones de próxima vez"
    control.addTarget(self, action: #selector(tappedOutside), for: .touchUpInside)
    return control
  }()
  private var host: NextSessionOptionsHost?

  func requestOpen(_ request: Int) {
    guard request > lastRequest else { return }
    lastRequest = request
    wantsOpen = true
    // Props arrive as a batch; refresh runs after editable/content have been applied.
  }
  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { outsideControl.removeFromSuperview(); wantsOpen = false; close() } else { refresh() }
  }
  public override func layoutSubviews() {
    super.layoutSubviews()
    host?.popoverPresentationController?.sourceRect = bounds
  }
  private func content() -> NextSessionOptionsContent {
    NextSessionOptionsContent(name: name, decision: decision, note: decisionNote,
      apply: applyToRoutine, applyLabel: applyLabel, extra: extra, accent: Color(accent), muted: Color(muted),
      inset: contentPadding, gap: contentSpacing, minTouch: minTouch,
      choose: { [weak self] decision in self?.onDecision(["decision": decision]); self?.close() },
      applyChange: { [weak self] value in self?.onApply(["value": value]); self?.close() })
  }
  func refresh() {
    if !editable { wantsOpen = false; close(); return }
    host?.rootView = content()
    host?.overrideUserInterfaceStyle = overrideUserInterfaceStyle
    presentIfReady()
  }
  private func presentIfReady() {
    guard wantsOpen, editable, !dismissing, host == nil, window != nil else { return }
    var responder: UIResponder? = self
    while responder != nil && !(responder is UIViewController) { responder = responder?.next }
    guard let presenter = responder as? UIViewController else { return }
    let controller = NextSessionOptionsHost(rootView: content())
    controller.onEscape = { [weak self] in self?.close() }
    controller.modalPresentationStyle = .popover
    controller.view.accessibilityViewIsModal = true
    controller.overrideUserInterfaceStyle = overrideUserInterfaceStyle
    controller.sizingOptions = [.preferredContentSize]
    guard let popover = controller.popoverPresentationController else { return }
    popover.sourceView = self
    popover.sourceRect = bounds
    popover.permittedArrowDirections = .right
    popover.delegate = self
    // Own outside dismissal instead of UIKit's modal shield, which ignores a fast second tap during its fade.
    // This transparent hit region exists only while presented. It excludes the real trigger and is removed
    // synchronously on close, so neither controls behind the popover nor the next opening tap are activated by mistake.
    popover.passthroughViews = [presenter.view]
    outsideControl.anchor = superview
    outsideControl.frame = presenter.view.bounds
    outsideControl.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    presenter.view.addSubview(outsideControl)
    host = controller
    wantsOpen = false
    presenting = true
    presenter.present(controller, animated: !UIAccessibility.isReduceMotionEnabled) { [self, weak controller] in
      guard controller === self.host else { return }
      self.presenting = false
      if self.closeAfterPresentation { self.closeAfterPresentation = false; self.close() }
    }
    onPresentationChange(["presented": true])
  }
  private func beginDismissal() {
    guard !dismissing else { return }
    dismissing = true
    wantsOpen = false
  }
  private func close() {
    guard let controller = host, !dismissing else { return }
    if presenting { closeAfterPresentation = true; return }
    beginDismissal()
    // Complete native hit testing in the closing gesture, before reporting closed to React.
    controller.dismiss(animated: false) { [weak self, weak controller] in
      guard let controller else { return }
      self?.finishedDismissal(controller)
    }
  }
  private func finishedDismissal(_ controller: UIViewController) {
    guard controller === host else { return }
    host = nil
    outsideControl.removeFromSuperview()
    dismissing = false
    presenting = false
    closeAfterPresentation = false
    onPresentationChange(["presented": false])
    // A tap received during dismissal is presented by UIKit's completion, never a clock or JS echo.
    presentIfReady()
  }
  @objc private func tappedOutside() { close() }
  public func adaptivePresentationStyle(for controller: UIPresentationController) -> UIModalPresentationStyle { .none }
  public func presentationControllerWillDismiss(_ presentationController: UIPresentationController) {
    if presentationController.presentedViewController === host { beginDismissal() }
  }
  public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { finishedDismissal(presentationController.presentedViewController) }
  public func popoverPresentationControllerShouldDismissPopover(_ popoverPresentationController: UIPopoverPresentationController) -> Bool {
    // Outside taps use our hit region; accessibility escape uses the host. Avoid the modal dismissal shield.
    return false
  }
  public func popoverPresentationControllerDidDismissPopover(_ popoverPresentationController: UIPopoverPresentationController) { finishedDismissal(popoverPresentationController.presentedViewController) }
}

private final class NextSessionOutsideControl: UIControl {
  weak var anchor: UIView?
  override init(frame: CGRect) {
    super.init(frame: frame)
    isAccessibilityElement = true
    accessibilityTraits = .button
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    if let anchor, anchor.bounds.contains(convert(point, to: anchor)) { return false }
    return super.point(inside: point, with: event)
  }
  override func accessibilityActivate() -> Bool { sendActions(for: .touchUpInside); return true }
}

private final class NextSessionOptionsHost: UIHostingController<NextSessionOptionsContent> {
  var onEscape: (() -> Void)?
  override func accessibilityPerformEscape() -> Bool { onEscape?(); return true }
}

private struct NextSessionOptionsContent: SwiftUI.View {
  let name: String, decision: String, note: String
  let apply: Bool, applyLabel: String?, extra: Bool
  let accent: Color, muted: Color
  let inset: Double, gap: Double, minTouch: Double
  let choose: (String) -> Void, applyChange: (Bool) -> Void
  var body: some SwiftUI.View {
    VStack(alignment: .leading, spacing: gap) {
      VStack(alignment: .leading, spacing: gap / 3) {
        Text("Próxima vez").font(.headline)
        Text(name).font(.caption).foregroundStyle(muted)
      }.frame(maxWidth: .infinity, alignment: .leading)
      Divider()
      option("Más peso", value: "increase_weight")
      option("Más repeticiones", value: "increase_reps")
      if decision == "custom" { option(note.isEmpty ? "Recordatorio anterior" : note, value: "custom") }
      if let applyLabel {
        Divider()
        Toggle(applyLabel, isOn: Binding(get: { apply }, set: applyChange)).toggleStyle(.switch)
        if extra { Text("Al finalizar, se agrega al final de la rutina con las series de hoy.").font(.caption).foregroundStyle(muted) }
      }
    }.padding(inset).frame(width: 300).tint(accent)
  }
  private func option(_ label: String, value: String) -> some SwiftUI.View {
    Toggle(isOn: Binding(get: { decision == value }, set: { _ in choose(value) })) {
      Label(label, systemImage: decision == value ? "checkmark" : "plus")
    }
      .toggleStyle(.button).buttonStyle(.plain).foregroundStyle(accent)
      .frame(maxWidth: .infinity, minHeight: minTouch, alignment: .leading)
  }
}
