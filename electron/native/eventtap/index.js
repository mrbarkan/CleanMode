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

// Darwin: load the prebuilt binary via node-gyp-build.
// node-gyp-build picks the right slice from prebuilds/<platform>-<arch>/.
const native = require('node-gyp-build')(__dirname);

module.exports = {
  start: native.start,
  stop: native.stop,
  isAccessibilityTrusted: native.isAccessibilityTrusted,
  promptAccessibility: native.promptAccessibility,
  isInputMonitoringTrusted: native.isInputMonitoringTrusted,
  promptInputMonitoring: native.promptInputMonitoring,
};
