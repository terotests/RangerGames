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
#
# An app of its own from the same code (fixes go to both), e.g. one game for
# a VR headset; it installs beside RangerGames:
#   RG_APP_ID=fi.rangergames.solarpilot  the Android package (default fi.rangergames)
#   RG_APP_NAME="Solar Pilot"            the name under the icon (default RangerGames)
#   RG_GAMES=/path/to/games              the folder of games to pack (default games/;
#                                        its voice clips are not rendered, _voice is
#                                        taken as it is)
#   RG_APP_START=solarpilot              the app opens this game in the launcher's
#                                        place (/games/_app.json; Back closes the app);
#                                        with game.json "xr" it opens in VR on a headset
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

# With the RangerDOM dependencies (scripts/setup-dom.sh) the engine is
# crates/rg_web_dom/android: the same calls, drawn with RangerDOM by default
# (EVG stays a choice in the menu's settings). Without them, crates/rg_android.
DOM=0
if [[ -d .deps/domtree && -d .deps/RangerDOM && "${RG_NO_DOM:-}" != 1 ]]; then DOM=1; fi
build() { # rust target, clang prefix, android abi
  local up
  up=$(echo "$1" | tr 'a-z-' 'A-Z_')
  mkdir -p "$JNI/$3"
  if [[ "$DOM" == 1 ]]; then
    (cd crates/rg_web_dom && env "CARGO_TARGET_DIR=../../target/dom" "CARGO_TARGET_${up}_LINKER=$TC/$2$API-clang" "CC_${1//-/_}=$TC/$2$API-clang" "AR_${1//-/_}=$TC/llvm-ar" \
      cargo build -p rg_android_dom --release --target "$1")
    cp "target/dom/$1/release/librg_android_dom.so" "$JNI/$3/librg_android.so"
  else
    env "CARGO_TARGET_${up}_LINKER=$TC/$2$API-clang" "CC_${1//-/_}=$TC/$2$API-clang" "AR_${1//-/_}=$TC/llvm-ar" \
      cargo build -p rg_android --release --target "$1"
    cp "target/$1/release/librg_android.so" "$JNI/$3/"
  fi
  "$TC/llvm-strip" "$JNI/$3/librg_android.so"
}
build aarch64-linux-android aarch64-linux-android arm64-v8a
build armv7-linux-androideabi armv7a-linux-androideabi armeabi-v7a

cargo build -p rg_cli --release
GAMES="${RG_GAMES:-games}"
# the voice clips of rg.say (voice/fi.json and voice/<lang>/ → games/_voice/<lang>; only changed clips are rendered)
if [[ -z "${RG_GAMES:-}" ]]; then scripts/build-voice.sh; fi
# the clips go to the APK as assets (assets/voice/<lang>/<id>.wav), read when said;
# the pack keeps only each language's index.json (which clips exist), since the
# whole pack is read into memory at boot and the clips would not fit there
rm -rf "$ASSETS/voice" && mkdir -p "$ASSETS/voice"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cp -RL "$GAMES" "$STAGE/games"
if [[ -n "${RG_APP_START:-}" ]]; then
  [[ -f "$STAGE/games/$RG_APP_START/game.json" ]] || { echo "no game $RG_APP_START in $GAMES" >&2; exit 1; }
  printf '{"start":"%s"}' "$RG_APP_START" > "$STAGE/games/_app.json"
fi
# each game's last commit date: the launcher compares it with a downloaded
# copy's (game.json "replaces") to show the newer one
for d in "$STAGE"/games/*/; do
  id=$(basename "$d")
  up=$(git log -1 --format=%cI -- "games/$id" 2>/dev/null || true)
  if [[ -f "$d/game.json" && -n "$up" ]]; then printf '{"updated":"%s"}' "$up" > "$d/_built.json"; fi
done
for d in "$STAGE"/games/_voice/*/; do
  [[ -d "$d" ]] || continue
  lang=$(basename "$d")
  mkdir -p "$ASSETS/voice/$lang"
  find "$d" -maxdepth 1 -name '*.wav' -exec mv {} "$ASSETS/voice/$lang/" \;
done
./target/release/rg_cli pack "$STAGE/games" "$ASSETS/games.rgpk"
ls -la "$ASSETS/games.rgpk"
if [[ ! -f "$ASSETS/fonts/Fredoka.ttf" ]]; then
  curl -sSfL -o "$ASSETS/fonts/Fredoka.ttf" "https://github.com/google/fonts/raw/main/ofl/fredoka/Fredoka%5Bwdth,wght%5D.ttf" \
    && curl -sSfL -o "$ASSETS/fonts/OFL.txt" "https://github.com/google/fonts/raw/main/ofl/fredoka/OFL.txt" \
    || echo "note: Fredoka not downloaded (offline?): the app uses the system font"
fi
cd android
gradle --no-daemon assembleRelease -PappId="${RG_APP_ID:-fi.rangergames}" -PappName="${RG_APP_NAME:-RangerGames}"
ls -la app/build/outputs/apk/release/
