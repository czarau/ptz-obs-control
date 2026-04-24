# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Church livestream camera control panel for Chatswood Seventh-day Adventist Church. 
A PHP/jQuery web app that controls PTZ (Pan-Tilt-Zoom) cameras, OBS Studio scenes, smart lighting, and audio sources for live streaming services.

Hosted at `voip.linkit.xyz/chatswood/`. Supports two site configurations selected via `?id=` query parameter: default (Chatswood) and `shccc` for a hirer

## Architecture

### Entry Point & Server-Side Rendering
`index.php` is the main page — it's a PHP file that outputs HTML. It:
- Selects site config (OBS WebSocket address, settings file) based on `?id=` param
- Reads preset settings from `.data/settings.json` (or `settings-shccc.json`)
- Renders camera preset grid with PHP helper functions (`GetPresetCamera`, `GetPresetLabel`, `GetPresetTimeout`)
- Injects `WebOBS_IP_Addr` and `WebOBS_Password` as JS constants

### Two JS Generations
- `control_v2.js` — current version, uses `CameraURL()` returning full URLs like `https://srv-syd05.chatswoodchurch.org:8806`. Also adds auto-queue and server-side preset persistence via `control_thumb.php`

The page loads `control_v2.js` (set in the `<script>` tag in `index.php`).

### Key Subsystems

**PTZ Camera Control** — Sends HTTP CGI commands to PTZ cameras (PTZOptics protocol):
- Pan/tilt/zoom via `/cgi-bin/ptzctrl.cgi?ptzcmd&left|right|up|down|zoomin|zoomout&speed`
- Preset recall: `poscall&{index}`, preset save: `posset&{index}`
- Camera 1 (Back) = port 8806, Camera 2 (Left) = 8807, Camera 3 (Right) = 8808
- Face tracking toggle via port 8810 (`setAutoTracking`)

**OBS WebSocket Integration** — Each OBS operation creates a new `OBSWebSocket()` instance, connects, executes, then discards. Uses obs-websocket v5 protocol (`obs.call()` API). Controls:
- Scene switching (`Camera 1 - Back`, `Camera 2 - Left`, `Camera 3 - Right`, `DP Full Screen`, `Emergency`)
- Recording/streaming toggle
- Audio source switching (Video Mix Aux 5, Church Mix Main, Analogue backup)
- NDI overlay visibility (Data Projection stream, Lower Third)

**Preset System** — Two index ranges per site:
- `preset_start_index` (100 for Chatswood, 20 for shccc) — user-facing preset positions
- `preset_admin_index` (150 for Chatswood, 60 for shccc) — admin/default positions for restore
- Presets stored server-side in `.data/settings[-shccc].json` via `control_thumb.php?cmd=set_preset`

**Thumbnail System** (`control_thumb.php`) — PHP proxy that:
- Captures snapshots from cameras and caches to `thumbs/{id}.jpg`
- Serves cached thumbnails (`thumb_cache`) or live captures (`thumb`)
- Also handles preset get/set, face tracking, and direct PTZ commands via Python

**Smart Device Control** — Toggles church lights (SPOTS, STAGE, FRONT) and LG TV panels via Home Assistant webhooks through `index.php?action=smartdevice`

**WebRTC Preview** (`webrtc.js`) — Connects to RTSPtoWeb server for live camera preview in `<video>` elements. Auto-reconnects on data channel close.

### Admin Access
Ctrl+click on the lock icon enables admin mode, which allows saving presets. The `?id=` param also sets the user identity for server-side preset storage.

## Tech Stack
- PHP (no framework, flat files for storage)
- jQuery 3.6 + jQuery UI (slider, context menus)
- OBS WebSocket v5 (`obs-websocket.js`)
- WebRTC via RTSPtoWeb
- FontAwesome icons
- Python scripts in `python/` subdirectory for advanced camera control

## File Locations
- Site root: `www/voip.linkit.xyz/chatswood/`
- Settings: `www/voip.linkit.xyz/chatswood/.data/`
- Thumbnails: `www/voip.linkit.xyz/chatswood/thumbs/`
- CSS: `www/voip.linkit.xyz/css/` and `style_v2.css` in chatswood dir

## Development Notes
- No build system, test suite, or linting — edit PHP/JS files directly
- Camera IPs and OBS credentials are hardcoded in source files
- The server at `srv-syd05.chatswoodchurch.org` acts as a reverse proxy to local camera IPs
- `global.php` includes a shared PHP library from `/opt/linkit/.global/global.php` (server-specific path)
