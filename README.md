# PTZ OBS Control

A web-based control panel for managing PTZ (Pan-Tilt-Zoom) cameras and OBS Studio during church livestream productions. Built for Chatswood Seventh-day Adventist Church.

## Features

- **PTZ Camera Control** — Pan, tilt, zoom, and recall presets for up to 3 PTZ cameras (PTZOptics protocol)
- **OBS Studio Integration** — Switch scenes, toggle recording/streaming, manage audio sources, and control NDI overlays via OBS WebSocket v5
- **Preset System** — 32 camera presets per site with thumbnail previews, labels, and auto-queue cycling
- **Smart Device Control** — Toggle stage lighting and display panels via Home Assistant webhooks
- **WebRTC Previews** — Low-latency live camera feeds directly in the browser
- **Multi-Site Support** — Configurable for multiple venues via `?id=` query parameter
- **Admin Mode** — Ctrl+click the lock icon to enable preset saving and management

## Tech Stack

- PHP (no framework, flat-file JSON storage)
- jQuery 3.6 + jQuery UI
- OBS WebSocket v5
- WebRTC via RTSPtoWeb
- Python (advanced camera control scripts)

## Setup

### Requirements

- PHP web server
- OBS Studio with WebSocket plugin (v5)
- PTZOptics-compatible cameras accessible via HTTP
- RTSPtoWeb server for WebRTC previews
- Home Assistant (optional, for smart device control)

### Configuration

1. Set your OBS WebSocket address and password in `control.php`
2. Configure camera endpoints (ports 8806–8808 by default)
3. Place the files under your web server root
4. Access via `control.php` (or `control.php?id=shccc` for alternate site config)

## Project Structure

```
www/voip.linkit.xyz/chatswood/
├── control.php          # Main entry point (PHP + HTML)
├── control_v2.js        # Client-side camera/OBS control logic
├── control_thumb.php    # Thumbnail capture & preset API
├── webrtc.js            # WebRTC camera preview connections
├── style_v2.css         # Stylesheet
├── obs-websocket.js     # OBS WebSocket client library
├── python/              # Python scripts for advanced camera control
├── .data/               # Settings JSON files (server-side)
└── thumbs/              # Cached camera thumbnails
```

## License

Private project — not licensed for external use.
