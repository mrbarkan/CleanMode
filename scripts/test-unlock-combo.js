// Check for the native unlock-combo detection: `node scripts/test-unlock-combo.js`
// Needs Accessibility + Input Monitoring for your terminal and Xcode's `swift`.
// Starts the real tap (your keyboard is blocked for ~2s), posts synthetic Cmd events,
// and expects exactly 3 combos: 3× both-Cmd presses count, a double single-Cmd does not.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tap = require(path.join(__dirname, '../electron/native/eventtap'));

const poster = path.join(os.tmpdir(), 'cleanmode-post-cmd.swift');
fs.writeFileSync(poster, `
import Foundation
import CoreGraphics
let src = CGEventSource(stateID: .hidSystemState)
func flags(_ keyCode: CGKeyCode, _ raw: UInt64) {
  let e = CGEvent(keyboardEventSource: src, virtualKey: keyCode, keyDown: true)!
  e.type = .flagsChanged
  e.flags = CGEventFlags(rawValue: raw)
  e.post(tap: .cghidEventTap)
  usleep(40_000)
}
let cmd: UInt64 = 0x100000, left: UInt64 = 0x8, right: UInt64 = 0x10
for _ in 0..<3 {
  flags(0x37, cmd | left)           // left Cmd down
  flags(0x36, cmd | left | right)   // right Cmd down -> combo
  flags(0x36, cmd | left)           // right up
  flags(0x37, 0)                    // left up
}
for _ in 0..<2 { flags(0x37, cmd | left); flags(0x37, 0) }   // double-tap left Cmd: no combo
`);

const posterBin = poster.replace(/\.swift$/, '');
execFileSync('swiftc', [poster, '-o', posterBin]);   // compile before the tap blocks the keyboard

let combos = 0;
const safety = setTimeout(() => { tap.stop(); console.error('safety stop'); process.exit(1); }, 10000);
if (!tap.start(() => combos++)) throw new Error('tap failed to start (permissions?)');
try {
  execFileSync(posterBin, { stdio: 'inherit' });
} finally {
  setTimeout(() => {
    tap.stop();
    clearTimeout(safety);
    console.log(`combos detected: ${combos} (expected 3)`);
    process.exit(combos === 3 ? 0 : 1);
  }, 300);
}
