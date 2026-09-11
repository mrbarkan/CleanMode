// CleanMode native event tap + Sparkle updater bridge.
// Public N-API surface: start, stop, isAccessibilityTrusted, promptAccessibility,
// isInputMonitoringTrusted, promptInputMonitoring, startUpdater, checkForUpdates.
// Drops every key event, Cmd included. The unlock combo (both Cmd keys held) is detected
// here and reported through the callback passed to start(). Cmd used to pass through so the
// renderer could see it, but then macOS's own double-Cmd shortcuts (Siri / Dictation — on by
// default with Apple Intelligence on Tahoe) fired and stole focus mid-unlock.
// The tap is run on a dedicated thread with its own CFRunLoop to avoid conflicts
// with Chromium's MessagePump on Electron's main thread.

#include <node_api.h>
#include <pthread.h>
#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>
#include <ApplicationServices/ApplicationServices.h>

#define NX_SYSDEFINED_EVENT_TYPE 14
#ifndef NX_DEVICELCMDKEYMASK
#define NX_DEVICELCMDKEYMASK 0x00000008
#define NX_DEVICERCMDKEYMASK 0x00000010
#endif

static CFMachPortRef     g_tap = NULL;
static CFRunLoopSourceRef g_runLoopSource = NULL;
static pthread_t          g_thread;
static CFRunLoopRef       g_thread_runloop = NULL;
static bool               g_thread_running = false;
static napi_threadsafe_function g_onCombo = NULL;
static bool               g_comboDown = false;   // tap thread only

static CGEventRef tapCallback(CGEventTapProxy proxy,
                              CGEventType type,
                              CGEventRef event,
                              void *userInfo) {
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        if (g_tap) CGEventTapEnable(g_tap, true);
        return event;
    }

    if (type == kCGEventFlagsChanged) {
        // Device-dependent flag bits describe which Cmd keys are held *now*, so a missed
        // key-up (e.g. Cmd held before the tap started) can't leave the state stuck.
        CGEventFlags flags = CGEventGetFlags(event);
        bool both = (flags & NX_DEVICELCMDKEYMASK) && (flags & NX_DEVICERCMDKEYMASK);
        if (both && !g_comboDown && g_onCombo) {
            napi_call_threadsafe_function(g_onCombo, NULL, napi_tsfn_nonblocking);
        }
        g_comboDown = both;
    }

    return NULL;
}

static void *threadMain(void *arg) {
    g_thread_runloop = CFRunLoopGetCurrent();

    CGEventMask mask =
        CGEventMaskBit(kCGEventKeyDown) |
        CGEventMaskBit(kCGEventKeyUp)   |
        CGEventMaskBit(kCGEventFlagsChanged) |
        CGEventMaskBit(NX_SYSDEFINED_EVENT_TYPE);

    g_tap = CGEventTapCreate(kCGSessionEventTap,
                             kCGHeadInsertEventTap,
                             kCGEventTapOptionDefault,
                             mask,
                             tapCallback,
                             NULL);

    if (g_tap) {
        g_runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, g_tap, 0);
        if (g_runLoopSource) {
            CFRunLoopAddSource(g_thread_runloop, g_runLoopSource, kCFRunLoopCommonModes);
            CGEventTapEnable(g_tap, true);

            // Keep-alive timer: a no-op timer that fires every hour. Its presence ensures
            // CFRunLoopRunInMode() always has scheduled work and never returns kCFRunLoopRunFinished.
            CFRunLoopTimerRef keepalive = CFRunLoopTimerCreateWithHandler(
                NULL,
                CFAbsoluteTimeGetCurrent() + 3600.0,
                3600.0,
                0, 0,
                ^(CFRunLoopTimerRef _) { /* no-op */ });
            CFRunLoopAddTimer(g_thread_runloop, keepalive, kCFRunLoopCommonModes);

            while (g_thread_running) {
                SInt32 reason = CFRunLoopRunInMode(kCFRunLoopDefaultMode, 60.0, false);
                if (reason == kCFRunLoopRunStopped) break;
            }

            CFRunLoopRemoveTimer(g_thread_runloop, keepalive, kCFRunLoopCommonModes);
            CFRelease(keepalive);
            CFRunLoopRemoveSource(g_thread_runloop, g_runLoopSource, kCFRunLoopCommonModes);
            CFRelease(g_runLoopSource);
            g_runLoopSource = NULL;
        }
        CFMachPortInvalidate(g_tap);
        CFRelease(g_tap);
        g_tap = NULL;
    }

    g_thread_runloop = NULL;
    g_thread_running = false;
    return NULL;
}

// Runs on the JS thread for each combo queued by the tap thread.
static void CallOnCombo(napi_env env, napi_value js_cb, void *context, void *data) {
    if (!env || !js_cb) return;
    napi_value undefined;
    napi_get_undefined(env, &undefined);
    napi_call_function(env, undefined, js_cb, 0, NULL, NULL);
}

static void ReleaseOnCombo() {
    if (g_onCombo) {
        napi_release_threadsafe_function(g_onCombo, napi_tsfn_release);
        g_onCombo = NULL;
    }
}

// start(onUnlockCombo?: () => void) — callback fires each time both Cmd keys go down.
static napi_value StartTap(napi_env env, napi_callback_info info) {
    napi_value result;
    if (g_thread_running) {
        napi_get_boolean(env, true, &result);
        return result;
    }

    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    napi_valuetype argType = napi_undefined;
    if (argc >= 1) napi_typeof(env, argv[0], &argType);
    ReleaseOnCombo();
    if (argType == napi_function) {
        napi_value name;
        napi_create_string_utf8(env, "onUnlockCombo", NAPI_AUTO_LENGTH, &name);
        napi_create_threadsafe_function(env, argv[0], NULL, name, 0, 1,
                                        NULL, NULL, NULL, CallOnCombo, &g_onCombo);
    }
    g_comboDown = false;

    g_thread_running = true;
    int rc = pthread_create(&g_thread, NULL, threadMain, NULL);
    if (rc != 0) {
        g_thread_running = false;
        ReleaseOnCombo();
        napi_get_boolean(env, false, &result);
        return result;
    }

    // Hide the OS cursor immediately on start. Because the native tap swallows
    // mouse-move events, Chromium never re-evaluates its CSS `cursor: none` until
    // a click slips through — so we hide at the window-server level instead.
    // Balanced by CGDisplayShowCursor in StopTap; macOS also auto-restores the
    // cursor if this app terminates while it's hidden.
    CGDisplayHideCursor(kCGDirectMainDisplay);

    napi_get_boolean(env, true, &result);
    return result;
}

static napi_value StopTap(napi_env env, napi_callback_info info) {
    if (g_thread_running) {
        g_thread_running = false;          // signal the loop to exit on next iteration
        if (g_thread_runloop) {
            CFRunLoopStop(g_thread_runloop);
        }
        pthread_join(g_thread, NULL);
        CGDisplayShowCursor(kCGDirectMainDisplay);   // balances the hide in StartTap
    }
    ReleaseOnCombo();   // tap thread is gone, nothing can call it any more
    napi_value result;
    napi_get_undefined(env, &result);
    return result;
}

static napi_value IsAccessibilityTrusted(napi_env env, napi_callback_info info) {
    bool trusted = AXIsProcessTrusted();
    napi_value result;
    napi_get_boolean(env, trusted, &result);
    return result;
}

static napi_value PromptAccessibility(napi_env env, napi_callback_info info) {
    NSDictionary *options = @{(__bridge id)kAXTrustedCheckOptionPrompt: @YES};
    bool trusted = AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);

    NSURL *url = [NSURL URLWithString:
        @"x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"];
    if (url) {
        [[NSWorkspace sharedWorkspace] openURL:url];
    }

    napi_value result;
    napi_get_boolean(env, trusted, &result);
    return result;
}

static napi_value IsInputMonitoringTrusted(napi_env env, napi_callback_info info) {
    bool trusted = CGPreflightListenEventAccess();
    napi_value result;
    napi_get_boolean(env, trusted, &result);
    return result;
}

static napi_value PromptInputMonitoring(napi_env env, napi_callback_info info) {
    bool trusted = CGRequestListenEventAccess();
    NSURL *url = [NSURL URLWithString:
        @"x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"];
    if (url) {
        [[NSWorkspace sharedWorkspace] openURL:url];
    }
    napi_value result;
    napi_get_boolean(env, trusted, &result);
    return result;
}

// ── Sparkle ──────────────────────────────────────────────────────────────────
// Sparkle.framework is copied into Contents/Frameworks by scripts/embed-sparkle.js and
// loaded at runtime, so this module builds without Sparkle's SDK and unpackaged dev runs
// (no framework) just report that no updater is available.

@protocol CMSparkleController
- (instancetype)initWithStartingUpdater:(BOOL)startUpdater
                        updaterDelegate:(id)updaterDelegate
                     userDriverDelegate:(id)userDriverDelegate;
- (void)checkForUpdates:(id)sender;
@end

@interface CMUpdaterDelegate : NSObject
@property (nonatomic, copy) NSString *feedURL;
@end

@implementation CMUpdaterDelegate
// SPUUpdaterDelegate: arm64 and x64 ship as separate zips, so each arch gets its own feed.
- (NSString *)feedURLStringForUpdater:(id)updater { return self.feedURL; }
@end

static id<CMSparkleController> g_updater = nil;
static CMUpdaterDelegate *g_updaterDelegate = nil;   // Sparkle only holds its delegate weakly

// startUpdater(feedURL: string): boolean — must run on the main thread (Electron main process).
static napi_value StartUpdater(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    char feed[1024] = {0};
    if (argc >= 1) napi_get_value_string_utf8(env, argv[0], feed, sizeof(feed), NULL);

    if (!g_updater) {
        NSString *fw = [[[NSBundle mainBundle] privateFrameworksPath]
                        stringByAppendingPathComponent:@"Sparkle.framework"];
        Class cls = [[NSBundle bundleWithPath:fw] load]
            ? NSClassFromString(@"SPUStandardUpdaterController") : nil;
        if (cls) {
            g_updaterDelegate = [CMUpdaterDelegate new];
            g_updaterDelegate.feedURL = [NSString stringWithUTF8String:feed];
            g_updater = [[cls alloc] initWithStartingUpdater:YES
                                             updaterDelegate:g_updaterDelegate
                                          userDriverDelegate:nil];
        }
    }

    napi_value result;
    napi_get_boolean(env, g_updater != nil, &result);
    return result;
}

static napi_value CheckForUpdates(napi_env env, napi_callback_info info) {
    [g_updater checkForUpdates:nil];
    napi_value result;
    napi_get_undefined(env, &result);
    return result;
}

static void DefineFn(napi_env env, napi_value exports, const char *name, napi_callback cb) {
    napi_value fn;
    napi_status s = napi_create_function(env, name, NAPI_AUTO_LENGTH, cb, NULL, &fn);
    if (s != napi_ok) { napi_throw_error(env, NULL, "create_function failed"); return; }
    s = napi_set_named_property(env, exports, name, fn);
    if (s != napi_ok) { napi_throw_error(env, NULL, "set_named_property failed"); return; }
}

NAPI_MODULE_INIT() {
    DefineFn(env, exports, "start",                    StartTap);
    DefineFn(env, exports, "stop",                     StopTap);
    DefineFn(env, exports, "isAccessibilityTrusted",   IsAccessibilityTrusted);
    DefineFn(env, exports, "promptAccessibility",      PromptAccessibility);
    DefineFn(env, exports, "isInputMonitoringTrusted", IsInputMonitoringTrusted);
    DefineFn(env, exports, "promptInputMonitoring",    PromptInputMonitoring);
    DefineFn(env, exports, "startUpdater",             StartUpdater);
    DefineFn(env, exports, "checkForUpdates",          CheckForUpdates);
    return exports;
}
