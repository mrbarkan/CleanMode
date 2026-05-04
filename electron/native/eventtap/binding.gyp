{
  "targets": [
    {
      "target_name": "eventtap",
      "sources": [ "eventtap.mm" ],
      "conditions": [
        [ 'OS=="mac"', {
          "xcode_settings": {
            "OTHER_CFLAGS": [ "-ObjC++", "-fobjc-arc" ],
            "MACOSX_DEPLOYMENT_TARGET": "11.0",
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17"
          },
          "link_settings": {
            "libraries": [
              "$(SDKROOT)/System/Library/Frameworks/AppKit.framework",
              "$(SDKROOT)/System/Library/Frameworks/ApplicationServices.framework",
              "$(SDKROOT)/System/Library/Frameworks/Carbon.framework"
            ]
          }
        } ]
      ]
    }
  ]
}
