#!/usr/bin/env bash
# Dev reload: game code to the phone, tablet or Quest without building an APK.
# Starts scripts/dev-server.mjs, connects the device to it with adb reverse
# and switches the app's dev link on; every saved .tsx/.ts/.css/picture/sound
# goes to the running app (scripts start the game again, style.css restyles
# it in place). The app's log comes to this terminal. See docs/dev-reload.md.
#
#   scripts/dev.sh                          games/ of this repository
#   scripts/dev.sh ~/games/solarpilot       one game's folder (/games/solarpilot)
#   scripts/dev.sh solarpilot=~/sp --full   under another id; send all its files first
#   scripts/dev.sh --game kello ...         start that game in the app
#   scripts/dev.sh --off                    the app's dev link off again
#   scripts/dev.sh --no-adb ...             only the server (the web page: ?dev=1)
# Several devices: ANDROID_SERIAL=<serial> scripts/dev.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${RG_DEV_PORT:-8787}
PKG=fi.rangergames
MARK=/sdcard/Android/data/$PKG/files/dev.json
GAME=""
ADB=1
SERVER_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --off)
      adb shell rm -f "$MARK" || true
      adb reverse --remove "tcp:$PORT" 2>/dev/null || true
      echo "dev link off (the app notices at its next start)"
      exit 0 ;;
    --game) GAME="$2"; shift 2 ;;
    --no-adb) ADB=0; shift ;;
    --port) PORT="$2"; shift 2 ;;
    *) SERVER_ARGS+=("$1"); shift ;;
  esac
done

if [[ $ADB == 1 ]]; then
  if ! adb get-state >/dev/null 2>&1; then
    echo "no device on adb (USB, or adb connect <ip>:5555 over Wi-Fi); only the server runs" >&2
    ADB=0
  fi
fi
if [[ $ADB == 1 ]]; then
  # the app reaches the server at its own 127.0.0.1 (USB and adb over Wi-Fi alike)
  adb reverse "tcp:$PORT" "tcp:$PORT" >/dev/null
  adb shell "mkdir -p /sdcard/Android/data/$PKG/files && echo '{\"url\":\"http://127.0.0.1:$PORT\"}' > $MARK"
  # the dev link starts with the app: start it again (the game too, if asked)
  adb shell am force-stop "$PKG"
  if [[ -n "$GAME" ]]; then
    adb shell am start -n "$PKG/.MainActivity" --es game "$GAME" >/dev/null
  else
    adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
  fi
  echo "dev: app started with its dev link on ($(adb get-serialno))"
fi
exec node scripts/dev-server.mjs --port "$PORT" ${SERVER_ARGS[@]+"${SERVER_ARGS[@]}"}
