import ExpoModulesCore
import UIKit

public final class OwnlevelKeyboardSheetModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OwnlevelKeyboardSheet")
    View(KeyboardSheetView.self) {
      Events("onClosed")
      Prop("sheetHeight") { (view, value: Double) in view.sheetHeight = CGFloat(value) }
      Prop("bottomInset") { (view, value: Double) in view.bottomInset = CGFloat(value) }
      Prop("presented") { (view, value: Bool) in view.presented = value }
      Prop("closing") { (view, value: Bool) in view.closing = value }
      Prop("reduceMotion") { (view, value: Bool) in view.reduceMotion = value }
      OnViewDidUpdateProps { view in view.updatePresentation() }
    }
  }
}

/// A constant-size React form stays in its Modal (including SwiftUI/Liquid Glass controls).
/// Its entrance is scheduled synchronously by UIKit's keyboard notification, on the main thread,
/// using the actual native curve, including curve 7. No JS event hop or second animation clock.
public final class KeyboardSheetView: ExpoView {
  var sheetHeight: CGFloat = 0
  var bottomInset: CGFloat = 0
  var presented = false
  var closing = false
  var reduceMotion = false
  let onClosed = EventDispatcher()

  private var started = false
  private var entered = false
  private var closingStarted = false
  private var closingAnimationStarted = false
  private var target: CGFloat?
  private var fallback: DispatchWorkItem?

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    // Keep the form below the viewport even before its first React measurement.
    transform = CGAffineTransform(translationX: 0, y: 10_000)
    NotificationCenter.default.addObserver(self, selector: #selector(keyboardFrame(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
  }

  deinit {
    fallback?.cancel()
    NotificationCenter.default.removeObserver(self)
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { fallback?.cancel() }
    else { updatePresentation() }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    updatePresentation()
  }

  func updatePresentation() {
    guard window != nil, presented, sheetHeight > 0 else { return }
    if closing {
      guard !closingStarted else { return }
      closingStarted = true
      fallback?.cancel()
      // The notification normally arrives synchronously and supplies the exit's native timing.
      endEditing(true)
      if !closingAnimationStarted { close(duration: 0.3, options: .curveEaseInOut) }
      return
    }
    guard !started, let field = findInput(in: self) else { return }
    started = true
    transform = CGAffineTransform(translationX: 0, y: sheetHeight)
    // Focusing here is essential: keyboard and sheet are now in the same UIKit transaction.
    guard field.becomeFirstResponder() else {
      // Recovery/conflict forms can deliberately make the field non-editable. They still
      // need to open so the user can read the notice and recover the existing write.
      move(to: 0, duration: 0.3, options: .curveEaseInOut)
      return
    }
    let work = DispatchWorkItem { [weak self] in
      guard let self, self.window != nil, !self.entered, !self.closing else { return }
      // External keyboards can focus without sending a software-keyboard notification.
      self.move(to: 0, duration: 0.3, options: .curveEaseInOut)
    }
    fallback = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: work)
  }

  private func findInput(in view: UIView) -> UIView? {
    if view is UITextField || view is UITextView { return view }
    for child in view.subviews {
      if let input = findInput(in: child) { return input }
    }
    return nil
  }

  @objc private func keyboardFrame(_ notification: Notification) {
    guard started, let window, let info = notification.userInfo,
          let frame = info[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
    let duration = (info[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0.3
    let curve = (info[UIResponder.keyboardAnimationCurveUserInfoKey] as? UInt) ?? 0
    let options = UIView.AnimationOptions(rawValue: curve << 16)
    if closingStarted {
      close(duration: duration, options: options)
      return
    }
    let local = window.convert(frame, from: window.screen.coordinateSpace)
    let intersection = window.bounds.intersection(local)
    let docked = !intersection.isNull && intersection.width >= window.bounds.width * 0.9
    let height = docked ? max(0, window.bounds.maxY - intersection.minY) : 0
    // iOS can publish an initial empty frame before the real software keyboard. It must not
    // start a short first entrance that the subsequent frame then interrupts.
    guard entered || height > 0 else { return }
    move(to: -max(0, height - bottomInset), duration: duration, options: options)
  }

  private func move(to destination: CGFloat, duration: TimeInterval, options: UIView.AnimationOptions) {
    guard target != destination else { return }
    entered = true
    target = destination
    fallback?.cancel()
    if reduceMotion || UIAccessibility.isReduceMotionEnabled {
      let first = layer.presentation()?.transform.m42 ?? transform.ty
      transform = CGAffineTransform(translationX: 0, y: destination)
      if first > 0 {
        alpha = 0
        UIView.animate(withDuration: 0.2) { self.alpha = 1 }
      }
    } else {
      UIView.animate(withDuration: duration, delay: 0, options: [options, .beginFromCurrentState, .allowUserInteraction]) {
        self.transform = CGAffineTransform(translationX: 0, y: destination)
      }
    }
  }

  private func close(duration: TimeInterval, options: UIView.AnimationOptions) {
    guard !closingAnimationStarted else { return }
    closingAnimationStarted = true
    let reduced = reduceMotion || UIAccessibility.isReduceMotionEnabled
    UIView.animate(withDuration: reduced ? 0.2 : duration, delay: 0, options: [options, .beginFromCurrentState, .allowUserInteraction]) {
      if reduced { self.alpha = 0 }
      else { self.transform = CGAffineTransform(translationX: 0, y: self.sheetHeight) }
    } completion: { [weak self] _ in self?.onClosed() }
  }
}
