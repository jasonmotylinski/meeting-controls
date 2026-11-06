# Meeting Controls

A free [VSD Craft](https://www.vsdinside.com/) (Stream Dock) plugin for macOS. It adds meeting keys for Zoom and Microsoft Teams.

| Action | Zoom | Microsoft Teams |
|---|---|---|
| **Mic Toggle** | Clicks *Meeting → Mute/Unmute Audio* | Sends ⌘⇧M |
| **Camera Toggle** | Clicks *Meeting → Start/Stop Video* | Sends ⌘⇧O |
| **Share Screen** | Clicks *Meeting → Start/Stop Share* (falls back to ⌘⇧S) | Sends ⌘⇧E |
| **Leave Meeting** | Clicks *Leave Meeting* (falls back to ⌘W); Zoom asks to confirm | Sends ⌘⇧H |
| **Meeting Status** | Shows the app and a meeting timer while you're in a meeting | Same (in-call detection is experimental) |
| **State on key** | Green (on) / red (off), polled every 2s; sharing shows orange | Not available; neutral icon |

Leave Meeting needs two presses within 2 seconds. The first press turns the key amber and shows "Again?".

How it handles each app:

- **Zoom:** the plugin clicks menu items, so it never takes focus. It reads the live mic and camera state from the same menu.
- **Teams:** Teams exposes no readable state and no menu for these actions. The plugin brings Teams to the front for a moment, sends the shortcut, then returns focus to the app you were using.
- If both apps are running, Zoom wins. If neither is running, the key shows an alert.

## Requirements

- macOS 10.15 or later
- VSD Craft 3.10.188.226 or later (it bundles Node 20)
- Accessibility permission for VSD Craft (System Settings → Privacy & Security → Accessibility). The plugin drives other apps through System Events.

## Install

```sh
cd plugin
npm install
osacompile -o meeting.scpt meeting.applescript   # optional: faster than the .applescript fallback
cd ..

PLUGINS="$HOME/Library/Application Support/HotSpot/StreamDock/plugins"
rsync -a --exclude .git ./ "$PLUGINS/com.meetingcontrols.sdPlugin/"
```

Restart VSD Craft. The actions appear under the **Meeting Controls** category. After any code change, copy the folder again and restart VSD Craft.

## Layout

```
manifest.json               Plugin manifest (SDKVersion 1, Node 20)
images/                     SVG key icons: neutral, -on (green), -off (red)
plugin/index.js             WebSocket client: key events, state polling, rendering
plugin/meeting.applescript  Does the work: toggle-mic | toggle-cam | status
```

`meeting.applescript` takes `toggle-mic`, `toggle-cam`, `toggle-share`, `leave`, `status` or `debug`. It prints one line, `<app> <mic> <cam> <share> <meeting>`. `app` is `zoom`, `teams`, or `none`; `mic`, `cam` and `share` are `on`, `off`, or `unknown`; `meeting` is `yes` or `no`. `debug` prints Zoom's menus and the Teams window titles, and the plugin logs it once at startup. You can test it on its own:

```sh
osascript plugin/meeting.applescript status
```

## Troubleshooting

- **Plugin doesn't start:** keep the manifest at `SDKVersion: 1` with `CodePathMac` and `"Nodejs": { "Version": "20" }`. VSD Craft did not launch the plugin with SDKVersion 2 or with the Node debug flag enabled.
- **Keys do nothing:** check that VSD Craft has Accessibility permission.
- **Logs:** the plugin writes `plugin.log` in the installed plugin folder.
- **Device not detected through a USB-C/Thunderbolt dock:** power-cycle the dock.

## License

MIT. See [LICENSE](LICENSE).
