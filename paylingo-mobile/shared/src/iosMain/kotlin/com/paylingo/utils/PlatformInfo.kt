package com.paylingo.utils

import platform.Foundation.NSBundle

actual val appVersionName: String
    get() {
        val bundle = NSBundle.mainBundle
        val version = bundle.objectForInfoDictionaryKey("CFBundleShortVersionString") as? String
        return version ?: "1.0.0"
    }

actual val platformName: String = "ios"
