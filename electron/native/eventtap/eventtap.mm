// CleanMode native event tap.
// Public N-API surface: start, stop, isAccessibilityTrusted, promptAccessibility,
// isInputMonitoringTrusted, promptInputMonitoring.
// Drops every key event except Cmd (left/right) so the renderer's unlock combo still works.
// The tap is run on a dedicated thread with its own CFRunLoop to avoid conflicts
// with Chromium's MessagePump on Electron's main thread.

#include <node_api.h>
#include <pthread.h>
#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>
#include <ApplicationServices/ApplicationServices.h>

#define NX_SYSDEFINED_EVENT_TYPE 14

static CFMachPortRef     g_tap = NULL;
static CFRunLoopSourceRef g_runLoopSource = NULL;
static pthread_t          g_thread;
static CFRunLoopRef       g_thread_runloop = NULL;
static bool               g_thread_running = false;

static CGEventRef tapCallback(CGEventTapProxy proxy,
                              CGEventType type,
                              CGEventRef event,
                              void *userInfo) {
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        if (g_tap) CGEventTapEnable(g_tap, true);
        return event;
    }

    if (type == kCGEventKeyDown || type == kCGEventKeyUp || type == kCGEventFlagsChanged) {
        CGKeyCode kc = (CGKeyCode)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
        if (kc == kVK_Command || kc == kVK_RightCommand) {
            return event;
        }
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

static napi_value StartTap(napi_env env, napi_callback_info info) {
    napi_value result;
    if (g_thread_running) {
        napi_get_boolean(env, true, &result);
        return result;
    }

    g_thread_running = true;
    int rc = pthread_create(&g_thread, NULL, threadMain, NULL);
    if (rc != 0) {
        g_thread_running = false;
        napi_get_boolean(env, false, &result);
        return result;
    }

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
    }
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
    return exports;
}
