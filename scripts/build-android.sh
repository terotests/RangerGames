#!/usr/bin/env bash
# Builds the Android app (an APK), natively: the engine (crates/rg_android)
# with the NDK for arm64 and 32-bit ARM phones, the games into a pack, and the
# Java host with gradle. No WebView: it runs on old phones too.
#   scripts/build-android.sh        needs the Android SDK (ANDROID_HOME) with an NDK,
#                                   gradle 8.x and the Rust targets
#                                   aarch64-linux-android armv7-linux-androideabi
# The APK is android/app/build/outputs/apk/release/app-release.apk; install it
# on the phone with `adb install -r <apk>`, or copy it over and open it
# (allow "install unknown apps" for the file manager once).
set -euo pipefail
cd "$(dirname "$0")/.."
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[[ -n "$SDK" ]] || { echo "set ANDROID_HOME" >&2; exit 1; }
NDK="${ANDROID_NDK_HOME:-$(ls -d "$SDK"/ndk/* 2>/dev/null | sort -V | tail -1)}"
[[ -d "$NDK" ]] || { echo "no NDK under $SDK/ndk" >&2; exit 1; }
TC=$(ls -d "$NDK"/toolchains/llvm/prebuilt/*/bin | head -1)
API=24
JNI=android/app/src/main/jniLibs
ASSETS=android/app/src/main/assets
rm -rf "$JNI" "$ASSETS"/web
mkdir -p "$ASSETS/fonts"

build() { # rust target, clang prefix, android abi
  local up
  up=$(echo "$1" | tr 'a-z-' 'A-Z_')
  env "CARGO_TARGET_${up}_LINKER=$TC/$2$API-clang" "CC_${1//-/_}=$TC/$2$API-clang" "AR_${1//-/_}=$TC/llvm-ar" \
    cargo build -p rg_android --release --target "$1"
  mkdir -p "$JNI/$3"
  cp "target/$1/release/librg_android.so" "$JNI/$3/"
  "$TC/llvm-strip" "$JNI/$3/librg_android.so"
}
build aarch64-linux-android aarch64-linux-android arm64-v8a
build armv7-linux-androideabi armv7a-linux-androideabi armeabi-v7a

cargo build -p rg_cli --release
./target/release/rg_cli pack games "$ASSETS/games.rgpk"
if [[ ! -f "$ASSETS/fonts/Fredoka.ttf" ]]; then
  curl -sSfL -o "$ASSETS/fonts/Fredoka.ttf" "https://github.com/google/fonts/raw/main/ofl/fredoka/Fredoka%5Bwdth,wght%5D.ttf" \
    && curl -sSfL -o "$ASSETS/fonts/OFL.txt" "https://github.com/google/fonts/raw/main/ofl/fredoka/OFL.txt" \
    || echo "note: Fredoka not downloaded (offline?): the app uses the system font"
fi
cd android
gradle --no-daemon assembleRelease
ls -la app/build/outputs/apk/release/
