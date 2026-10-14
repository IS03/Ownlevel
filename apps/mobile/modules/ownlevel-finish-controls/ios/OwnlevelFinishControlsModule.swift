import ExpoModulesCore
import UIKit

public final class OwnlevelFinishControlsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OwnlevelFinishControls")
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
      self.control.setThumbImage(nil, for: .normal)
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
  func updateAppearance() {
    control.minimumTrackTintColor = answered ? accent : .clear
    control.setThumbImage(answered ? nil : UIImage(), for: .normal)
    number.isHidden = !answered; number.textColor = accent
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
