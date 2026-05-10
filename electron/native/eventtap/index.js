'use strict';

// Platform short-circuit: on non-Darwin (Windows/Linux dev machines), this module
// returns benign stubs so the rest of the app's lifecycle code runs unchanged.
if (process.platform !== 'darwin') {
  module.exports = {
    start: () => true,
    stop: () => {},
    isAccessibilityTrusted: () => true,
    promptAccessibility: () => true,
    isInputMonitoringTrusted: () => true,
    promptInputMonitoring: () => true,
  };
  return;
}

// Load the prebuilt binary for the current architecture.
const path = require('path');
const binaryPath = path.join(
  __dirname,
  'prebuilds',
  `${process.platform}-${process.arch}`,
  'cleanmode-eventtap.node'
);
const native = require(binaryPath);

module.exports = {
  start: native.start,
  stop: native.stop,
  isAccessibilityTrusted: native.isAccessibilityTrusted,
  promptAccessibility: native.promptAccessibility,
  isInputMonitoringTrusted: native.isInputMonitoringTrusted,
  promptInputMonitoring: native.promptInputMonitoring,
};
