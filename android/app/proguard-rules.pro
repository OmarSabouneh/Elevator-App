# WebView rules
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-keepclassmembers class com.elevator.app.MainActivity {
    <methods>;
}

# Keep WebView related classes
-keep class android.webkit.** { *; }
-keep class com.elevator.app.** { *; }