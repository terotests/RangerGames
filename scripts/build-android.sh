#!/usr/bin/env bash
# Builds the Android app (an APK) from the web build:
#   scripts/build-android.sh        needs the Android SDK (ANDROID_HOME) and gradle 8.x
# The APK is android/app/build/outputs/apk/release/app-release.apk; install it
# on the phone with `adb install -r <apk>`, or copy it over and open it
# (allow "install unknown apps" for the file manager once).
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f dist/web/rg_web.wasm ]] || bash scripts/build-web.sh
ASSETS=android/app/src/main/assets/web
mkdir -p "$ASSETS"
cp -r dist/web/. "$ASSETS"/
# the page's service worker and web manifest are for browsers only
rm -f "$ASSETS/sw.js"
cd android
gradle --no-daemon assembleRelease
ls -la app/build/outputs/apk/release/
