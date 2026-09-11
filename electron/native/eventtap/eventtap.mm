// CleanMode native event tap + Sparkle updater bridge.
// Public N-API surface: start, stop, isAccessibilityTrusted, promptAccessibility,
// isInputMonitoringTrusted, promptInputMonitoring, startUpdater, checkForUpdates.
//
// While running, the tap:
// - drops every key event, Cmd included, and reports input through the callback passed to
//   start(): "combo" when both Cmd keys go down (the unlock combo), "key" for other presses.
//   Cmd used to pass through for the renderer, but then macOS's own double-Cmd shortcuts
//   (Siri / Dictation — on by default with Apple Intelligence on Tahoe) stole focus mid-unlock.
// - drops scroll, swipe/pinch/rotate gestures and force touch (Mission Control, Spaces,
//   Notification Center, Look Up).
// - pins the real cursor mid-display and moves a virtual pointer instead, clamped to the
//   locked display, so hot corners and other displays are unreachable but clicks and hover
//   (emergency unlock, ripples) still land in the window.
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
#define DEVICE_MODIFIER_BITS 0x0000207F   // left/right ctrl, shift, alt, cmd

enum { kInputCombo = 1, kInputKey = 2 };

static CFMachPortRef     g_tap = NULL;
static CFRunLoopSourceRef g_runLoopSource = NULL;
static pthread_t          g_thread;
static CFRunLoopRef       g_thread_runloop = NULL;
static bool               g_thread_running = false;
static napi_threadsafe_function g_onInput = NULL;
// Tap-thread state while running; set by StartTap before the thread starts, read by StopTap after join.
static bool               g_comboDown = false;
static CGEventFlags       g_prevFlags = 0;
static CGRect             g_bounds;    // locked display, global points (top-left origin)
static CGPoint            g_pointer;   // virtual pointer

static void emit(intptr_t kind) {
    if (g_onInput) napi_call_threadsafe_function(g_onInput, (void *)kind, napi_tsfn_nonblocking);
}

static CGFloat clamp(CGFloat v, CGFloat lo, CGFloat hi) { return v < lo ? lo : (v > hi ? hi : v); }

static CGEventRef tapCallback(CGEventTapProxy proxy,
                              CGEventType type,
                              CGEventRef event,
                              void *userInfo) {
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        if (g_tap) CGEventTapEnable(g_tap, true);
        return event;
    }

    switch (type) {
        case kCGEventMouseMoved:
        case kCGEventLeftMouseDragged:
        case kCGEventRightMouseDragged:
        case kCGEventOtherMouseDragged:
            g_pointer.x = clamp(g_pointer.x + CGEventGetIntegerValueField(event, kCGMouseEventDeltaX),
                                CGRectGetMinX(g_bounds), CGRectGetMaxX(g_bounds) - 1);
            g_pointer.y = clamp(g_pointer.y + CGEventGetIntegerValueField(event, kCGMouseEventDeltaY),
                                CGRectGetMinY(g_bounds), CGRectGetMaxY(g_bounds) - 1);
            // fall through
        case kCGEventLeftMouseDown:
        case kCGEventLeftMouseUp:
        case kCGEventRightMouseDown:
        case kCGEventRightMouseUp:
        case kCGEventOtherMouseDown:
        case kCGEventOtherMouseUp:
            CGEventSetLocation(event, g_pointer);   // routes the event to our window at the virtual spot
            return event;

        case kCGEventKeyDown:
            if (!CGEventGetIntegerValueField(event, kCGKeyboardEventAutorepeat)) emit(kInputKey);
            return NULL;

        case kCGEventFlagsChanged: {
            // Device-dependent flag bits describe which modifiers are held *now*, so a missed
            // key-up (e.g. Cmd held before the tap started) can't leave the state stuck.
            CGEventFlags flags = CGEventGetFlags(event);
            bool both = (flags & NX_DEVICELCMDKEYMASK) && (flags & NX_DEVICERCMDKEYMASK);
            if (both && !g_comboDown) {
                emit(kInputCombo);
            } else if (__builtin_popcountll(flags & DEVICE_MODIFIER_BITS) >
                       __builtin_popcountll(g_prevFlags & DEVICE_MODIFIER_BITS)) {
                emit(kInputKey);   // a modifier went down
            }
            g_comboDown = both;
            g_prevFlags = flags;
            return NULL;
        }

        default:
            // Key-ups, media/system keys, scroll, gestures, force touch.
            return NULL;
    }
}

static void *threadMain(void *arg) {
    g_thread_runloop = CFRunLoopGetCurrent();

    CGEventMask mask =
        CGEventMaskBit(kCGEventKeyDown) |
        CGEventMaskBit(kCGEventKeyUp)   |
        CGEventMaskBit(kCGEventFlagsChanged) |
        CGEventMaskBit(NX_SYSDEFINED_EVENT_TYPE) |
        CGEventMaskBit(kCGEventMouseMoved) |
        CGEventMaskBit(kCGEventLeftMouseDown)  | CGEventMaskBit(kCGEventLeftMouseUp)  |
        CGEventMaskBit(kCGEventRightMouseDown) | CGEventMaskBit(kCGEventRightMouseUp) |
        CGEventMaskBit(kCGEventOtherMouseDown) | CGEventMaskBit(kCGEventOtherMouseUp) |
        CGEventMaskBit(kCGEventLeftMouseDragged) | CGEventMaskBit(kCGEventRightMouseDragged) |
        CGEventMaskBit(kCGEventOtherMouseDragged) |
        CGEventMaskBit(kCGEventScrollWheel) |
        CGEventMaskBit((CGEventType)NSEventTypeRotate) |
        CGEventMaskBit((CGEventType)NSEventTypeBeginGesture) |
        CGEventMaskBit((CGEventType)NSEventTypeEndGesture) |
        CGEventMaskBit((CGEventType)NSEventTypeGesture) |
        CGEventMaskBit((CGEventType)NSEventTypeMagnify) |
        CGEventMaskBit((CGEventType)NSEventTypeSwipe) |
        CGEventMaskBit((CGEventType)NSEventTypeSmartMagnify) |
        CGEventMaskBit((CGEventType)NSEventTypePressure);

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

// Runs on the JS thread for each input queued by the tap thread.
static void CallOnInput(napi_env env, napi_value js_cb, void *context, void *data) {
    if (!env || !js_cb) return;
    napi_value undefined, kind;
    napi_get_undefined(env, &undefined);
    napi_create_string_utf8(env, (intptr_t)data == kInputCombo ? "combo" : "key", NAPI_AUTO_LENGTH, &kind);
    napi_call_function(env, undefined, js_cb, 1, &kind, NULL);
}

static void ReleaseOnInput() {
    if (g_onInput) {
        napi_release_threadsafe_function(g_onInput, napi_tsfn_release);
        g_onInput = NULL;
    }
}

static double GetNumber(napi_env env, napi_value obj, const char *key) {
    napi_value v;
    double d = 0;
    if (napi_get_named_property(env, obj, key, &v) == napi_ok) napi_get_value_double(env, v, &d);
    return d;
}

// start(onInput?: (kind: 'combo' | 'key') => void, bounds?: {x, y, width, height})
// bounds = the locked display in global points; defaults to the main display.
static napi_value StartTap(napi_env env, napi_callback_info info) {
    napi_value result;
    if (g_thread_running) {
        napi_get_boolean(env, true, &result);
        return result;
    }

    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    napi_valuetype cbType = napi_undefined, boundsType = napi_undefined;
    if (argc >= 1) napi_typeof(env, argv[0], &cbType);
    if (argc >= 2) napi_typeof(env, argv[1], &boundsType);

    ReleaseOnInput();
    if (cbType == napi_function) {
        napi_value name;
        napi_create_string_utf8(env, "onInput", NAPI_AUTO_LENGTH, &name);
        napi_create_threadsafe_function(env, argv[0], NULL, name, 0, 1,
                                        NULL, NULL, NULL, CallOnInput, &g_onInput);
    }
    g_bounds = boundsType == napi_object
        ? CGRectMake(GetNumber(env, argv[1], "x"), GetNumber(env, argv[1], "y"),
                     GetNumber(env, argv[1], "width"), GetNumber(env, argv[1], "height"))
        : CGDisplayBounds(CGMainDisplayID());
    g_pointer = CGPointMake(CGRectGetMidX(g_bounds), CGRectGetMidY(g_bounds));
    CGPoint parked = g_pointer;   // the tap thread owns g_pointer once it starts
    g_comboDown = false;
    g_prevFlags = 0;

    g_thread_running = true;
    int rc = pthread_create(&g_thread, NULL, threadMain, NULL);
    if (rc != 0) {
        g_thread_running = false;
        ReleaseOnInput();
        napi_get_boolean(env, false, &result);
        return result;
    }

    // Park the real cursor mid-display and detach it from the mouse (restored in StopTap,
    // or automatically if the app quits or loses the foreground).
    CGWarpMouseCursorPosition(parked);
    CGAssociateMouseAndMouseCursorPosition(false);

    // Hide the OS cursor immediately on start. Chromium's CSS `cursor: none` only
    // applies once it re-evaluates the cursor, so we hide at the window-server level instead.
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
        CGAssociateMouseAndMouseCursorPosition(true);
        CGWarpMouseCursorPosition(g_pointer);          // cursor reappears where the pointer last was
        CGDisplayShowCursor(kCGDirectMainDisplay);   // balances the hide in StartTap
    }
    ReleaseOnInput();   // tap thread is gone, nothing can call it any more
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
