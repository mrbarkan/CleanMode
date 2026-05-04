// CleanMode native event tap.
// Public N-API surface: start, stop, isAccessibilityTrusted, promptAccessibility.
// Drops every key event except Cmd (left/right) so the renderer's unlock combo still works.

#include <node_api.h>
#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>
#include <ApplicationServices/ApplicationServices.h>

// NSSystemDefined event type, as raw integer.
// Defined in IOKit/hidsystem/IOLLEvent.h as NX_SYSDEFINED == 14.
// Hardcoding 14 here avoids pulling in IOKit just for the constant.
#define NX_SYSDEFINED_EVENT_TYPE 14

static CFMachPortRef     g_tap = NULL;
static CFRunLoopSourceRef g_runLoopSource = NULL;

static CGEventRef tapCallback(CGEventTapProxy proxy,
                              CGEventType type,
                              CGEventRef event,
                              void *userInfo) {
    // Re-enable on watchdog timeout. Mandatory: macOS auto-disables a slow tap after ~1s.
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        if (g_tap) CGEventTapEnable(g_tap, true);
        return event;
    }

    // Allow Cmd keys through so the renderer's triple-Cmd unlock combo works.
    if (type == kCGEventKeyDown || type == kCGEventKeyUp || type == kCGEventFlagsChanged) {
        CGKeyCode kc = (CGKeyCode)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
        if (kc == kVK_Command || kc == kVK_RightCommand) {
            return event;
        }
    }

    // Drop everything else: F-keys, brightness, volume, Mission Control,
    // Spotlight, dictation, media, etc.
    return NULL;
}

static napi_value StartTap(napi_env env, napi_callback_info info) {
    napi_value result;
    if (g_tap) {
        // Already running — idempotent.
        napi_get_boolean(env, true, &result);
        return result;
    }

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
    if (!g_tap) {
        napi_get_boolean(env, false, &result);
        return result;
    }

    g_runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, g_tap, 0);
    if (!g_runLoopSource) {
        CFRelease(g_tap);
        g_tap = NULL;
        napi_get_boolean(env, false, &result);
        return result;
    }
    CFRunLoopAddSource(CFRunLoopGetCurrent(), g_runLoopSource, kCFRunLoopCommonModes);
    CGEventTapEnable(g_tap, true);

    napi_get_boolean(env, true, &result);
    return result;
}

static napi_value StopTap(napi_env env, napi_callback_info info) {
    if (g_runLoopSource) {
        CFRunLoopRemoveSource(CFRunLoopGetCurrent(), g_runLoopSource, kCFRunLoopCommonModes);
        CFRelease(g_runLoopSource);
        g_runLoopSource = NULL;
    }
    if (g_tap) {
        CFMachPortInvalidate(g_tap);
        CFRelease(g_tap);
        g_tap = NULL;
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

    // Open System Settings → Privacy & Security → Accessibility (best-effort).
    NSURL *url = [NSURL URLWithString:
        @"x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"];
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
    DefineFn(env, exports, "start",                  StartTap);
    DefineFn(env, exports, "stop",                   StopTap);
    DefineFn(env, exports, "isAccessibilityTrusted", IsAccessibilityTrusted);
    DefineFn(env, exports, "promptAccessibility",    PromptAccessibility);
    return exports;
}
