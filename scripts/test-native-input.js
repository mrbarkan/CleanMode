// Check for the native tap's input handling: `node scripts/test-native-input.js`
// Needs Accessibility + Input Monitoring for your terminal and Xcode's `swiftc`.
// Starts the real tap (keyboard + pointer blocked for ~2s) and posts synthetic events:
// - 3× both-Cmd presses → 3 "combo"; 5 other modifier presses → 5 "key"
// - a huge pointer move → arrives clamped to the main display's bottom-right pixel
// - a scroll → never reaches apps
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tap = require(path.join(__dirname, '../electron/native/eventtap'));

const src = path.join(os.tmpdir(), 'cleanmode-post-input.swift');
const bin = src.replace(/\.swift$/, '');
fs.writeFileSync(src, `
import Foundation
import CoreGraphics

// Listen-only tap *after* CleanMode's session tap: sees what apps would receive.
var scrollsSeen = 0
var lastMouse = CGPoint(x: -1, y: -1)   // sentinel: no move observed
let observed = CGEventMask(1 << CGEventType.mouseMoved.rawValue | 1 << CGEventType.scrollWheel.rawValue)
guard let observer = CGEvent.tapCreate(tap: .cgAnnotatedSessionEventTap, place: .tailAppendEventTap,
    options: .listenOnly, eventsOfInterest: observed, callback: { _, type, event, _ in
      if type == .scrollWheel { scrollsSeen += 1 }
      if type == .mouseMoved { lastMouse = event.location }
      return Unmanaged.passUnretained(event)
    }, userInfo: nil) else { fatalError("observer tap failed") }
CFRunLoopAddSource(CFRunLoopGetMain(), CFMachPortCreateRunLoopSource(nil, observer, 0), .commonModes)

let source = CGEventSource(stateID: .hidSystemState)
func flags(_ keyCode: CGKeyCode, _ raw: UInt64) {
  let e = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true)!
  e.type = .flagsChanged
  e.flags = CGEventFlags(rawValue: raw)
  e.post(tap: .cghidEventTap)
  usleep(40_000)
}

DispatchQueue.global().async {
  let cmd: UInt64 = 0x100000, left: UInt64 = 0x8, right: UInt64 = 0x10
  for _ in 0..<3 {
    flags(0x37, cmd | left)           // left Cmd down → key
    flags(0x36, cmd | left | right)   // right Cmd down → combo
    flags(0x36, cmd | left)           // right up
    flags(0x37, 0)                    // left up
  }
  for _ in 0..<2 { flags(0x37, cmd | left); flags(0x37, 0) }   // double-tap left Cmd → 2 keys, no combo

  // Past any display edge, but small enough not to overflow the delta field.
  let far = CGPoint(x: 3_000, y: 3_000)
  let move = CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: far, mouseButton: .left)!
  move.setIntegerValueField(.mouseEventDeltaX, value: 3_000)
  move.setIntegerValueField(.mouseEventDeltaY, value: 3_000)
  move.post(tap: .cghidEventTap)
  usleep(100_000)

  CGEvent(scrollWheelEvent2Source: source, units: .pixel, wheelCount: 1, wheel1: 10, wheel2: 0, wheel3: 0)!
    .post(tap: .cghidEventTap)
  usleep(150_000)

  let b = CGDisplayBounds(CGMainDisplayID())
  let clamped = lastMouse == CGPoint(x: b.maxX - 1, y: b.maxY - 1)
  print("pointer: \\(lastMouse) (expected \\(b.maxX - 1), \\(b.maxY - 1)); scrolls reaching apps: \\(scrollsSeen) (expected 0)")
  exit(clamped && scrollsSeen == 0 ? 0 : 2)
}
CFRunLoopRun()
`);
execFileSync('swiftc', [src, '-o', bin]);   // compile before the tap blocks input

const counts = { combo: 0, key: 0 };
let posterOk = true;
const safety = setTimeout(() => { tap.stop(); console.error('safety stop'); process.exit(1); }, 10000);
if (!tap.start((kind) => counts[kind]++)) throw new Error('tap failed to start (permissions?)');
try {
  execFileSync(bin, { stdio: 'inherit' });
} catch {
  posterOk = false;
}
setTimeout(() => {
  tap.stop();
  clearTimeout(safety);
  console.log(`combo: ${counts.combo} (expected 3), key: ${counts.key} (expected 5)`);
  process.exit(posterOk && counts.combo === 3 && counts.key === 5 ? 0 : 1);
}, 300);
