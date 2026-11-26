# Dev reload: game code to the device without an APK build

The APK carries the games as source (games.rgpk) and the engine compiles a
game's TSX every time it starts it. So a code change needs no new APK, only
the new files in the app's virtual directory. `scripts/dev.sh` does that while
you edit.

```
scripts/dev.sh                         # games/ of this repository
scripts/dev.sh ~/games/solarpilot      # one game's folder → /games/solarpilot
scripts/dev.sh solarpilot=~/sp --full  # under another id, all its files sent first
scripts/dev.sh --game kello            # start that game in the app
scripts/dev.sh --off                   # dev link off again
scripts/dev.sh --app fi.rangergames.solarpilot ~/games/solarpilot   # a one-game app (Quest)
```

It needs a device on adb (USB, or `adb connect <ip>:5555` over Wi-Fi; phones,
tablets and the Quest alike) and an APK that has DevLink (2026-11 or newer).
`dev.sh` runs `adb reverse tcp:8787`, writes
`/sdcard/Android/data/fi.rangergames/files/dev.json` (the app's switch: no
file, no dev link), restarts the app and runs `scripts/dev-server.mjs`.

What a save does in the running app:

| saved | the app |
|---|---|
| `.tsx` `.ts` `.js` `game.json`, texts | starts the game again from the new files (~20 ms engine time) |
| the game's `style.css` alone | restyles it in place, the game keeps running |
| pictures, sounds | forgets its decoded copy, the new one shows when next drawn/played |
| another game's files | puts them; they are used when that game starts |
| a new game's `game.json` | the launcher (if open) starts again and lists it |

The engine's log (console.log, errors with file and line) comes to the
terminal. A typo shows its error on the screen; the next save starts the game
again.

## Quest

The headset's VR view (XrActivity) boots like the phone, so the dev link works
there too; files go in between VR frames. Over Wi-Fi: once with the cable
`adb tcpip 5555`, then `adb connect <quest-ip>:5555`. A one-game app built with
`RG_APP_ID` (Solar Pilot: `fi.rangergames.solarpilot`) needs `--app <id>`
(or `RG_APP_ID=<id>`), since its files folder and package differ. Its game
folder there is /games/<id> as in the build (solarpilot).

## Keeping the state: rg.onHot / rg.hot

A game that wants to stay where it was gives its state to the next version:

```tsx
let level = rg.hot ? rg.hot.level : 1;
let score = rg.hot ? rg.hot.score : 0;
rg.onHot(() => ({ level, score }));
```

`rg.hot` is set before the game's code runs and is null on a normal start.
The value goes through JSON. A failed reload (a typo) keeps it for the next
one. Saves (`rg.save`) stay in any case.

## Only the changes go

By default only files saved after the server started go to the app (the APK
already has the rest). If the app restarts, it gets all of them again. `--full`
sends every file of the named game folders at the start, for a game the APK
does not have or has an old copy of; mind the phone's memory with big folders
(Solar Pilot is ~180 MB with sph/ and img/).

## Web

The same server works for the web page: open it with `?dev=1` (or
`?dev=http://127.0.0.1:<port>`), e.g. a local build of `scripts/build-web.sh`
served from dist/web, and run `scripts/dev.sh --no-adb`. Only a server on the
same computer is accepted.

## Still needs an APK build

Rust (engine) and Java (host) changes, new assets in the APK (voice clips),
and the AndroidManifest.
