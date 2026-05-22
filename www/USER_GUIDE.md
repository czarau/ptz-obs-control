# LiveStream Console — Operator Guide (v2)

This is the new console at `voip.linkit.xyz/chatswood/v2/`.
The old version still lives at `voip.linkit.xyz/chatswood/` if you ever need it.

This guide covers **what's different in v2** and **how to drive a service**
end-to-end. If you're comfortable with v1 you can skim the headings — most
of the day-to-day basics still work the same way.

---

## At a glance — what's new

- **Two-click cue → take.** Click once to *arm* the next shot (green CUE),
  click again or hit Space to *take* it live (red LIVE). Keeps you from
  cutting to a camera by accident.
- **The previous shot becomes the next cue automatically.** Switch from
  Cam 1 to Cam 2 and Cam 1 is now armed — Space again to ping-pong back.
- **Drag and drop** to save preset positions. Drag a live feed onto a
  thumb to capture its current view; drag one thumb onto another to copy.
- **HOME is per-camera and saves the current position.** Right-click the
  HOME button under the joystick to capture wherever the camera is now.
- **Auto-queue** runs a sequence of presets on a timer. It pauses
  automatically the moment you take over.
- **The Slides button is sticky.** Set it on or off any time — clicking
  the data feed will respect it.
- **Live thumb preview.** The thumb of whichever preset the camera is
  currently parked at updates from the live video once a second.
- **Broadcast tally colours.** Red = ON AIR, Green = CUE.

---

## The big idea: cue, then take

In v1 a single click took a shot live straight away. v2 splits this into
**two steps** — same as a real broadcast switcher.

| Step | Action | What happens |
|------|--------|--------------|
| 1. CUE | Click a thumb / live feed, **or** press 1–4 | Green CUE badge appears. Camera is armed. **Nothing is on air yet.** |
| 2. TAKE | Click the cued item again, **or** press Space, **or** hit the TAKE button | The cued shot goes live. Red LIVE badge appears. |

A few things follow from this:

- **Arrow keys move the cued camera, not the live one.** That way you
  can frame the next shot before taking it. (If nothing is cued, the
  arrows fall back to the live camera.)
- **Whatever was on air becomes the new cue.** Most service flow is
  ping-pong between two shots, so this saves a click.
- **Only one cue at a time.** Cueing a different camera replaces the
  previous cue.

There's no separate "abandon cue" key — just cue something else, or
press Escape to clear.

---

## The preset grid

The big grid in the middle is the same idea as v1 — five columns of
thumbnails grouped by use (Speaker, Piano, Singers, Congregation,
Custom), plus an extra **Auto Queue** column on the right. Each thumb is
one preset.

### Clicking a thumb

- **First click** — arms it as the cue (green).
- **Second click on the same thumb** — takes it live.
- **Click a different thumb** — replaces the cue.

If a thumb is on the camera that's already live, hovering shows a big
red **LIVE** warning across the thumb. Clicking it would physically pan
a camera that viewers are watching, so the warning forces a deliberate
second click.

### The active thumb shows a live picture

When a camera is parked at a preset, that thumb's image refreshes from
the live video stream once a second. So you can glance at the grid and
see what the cameras are actually pointing at right now — not a stale
cached shot.

The on-disk thumbnail only gets rewritten **just before the camera
moves**, so the cached picture is always "the last frame seen at this
preset before we left it" — exactly what you want when looking back at
a thumb that isn't currently live.

### Right-click menu

Right-click any thumb for:

- **Rename** — change the label under the thumb.
- **Set Timeout** *(queue items only)* — how long the auto-queue holds
  this shot before advancing. 5–60 seconds.
- **Restore Default** — pull this slot's saved default back into use.
- **Save as Default** *(admin only)* — capture the camera's current
  view as this slot's default. Used for setting up a new service or
  fixing presets after a firmware reset.

### Drag and drop

- **Drag a live feed onto a thumb.** This captures whatever the camera
  is currently looking at and saves it to that preset slot — including
  pan, tilt, zoom, focus, and the live image. This is the v2 replacement
  for the old "Save Camera Back / Left / Right" right-click items.
- **Drag a thumb onto another thumb.** Copies the source preset's
  position values **and** thumbnail image to the destination. The
  destination keeps its label.

Only thumbs with saved positions can be dragged as a *source* — empty
slots are not draggable.

---

## The live feeds (bottom row)

Four cards along the bottom: Cam Back, Cam Left, Cam Right, Data
Projection.

### Click model

Same as the preset grid — first click cues, second click takes. You can
also use the keyboard:

| Key | Action |
|-----|--------|
| 1   | Cue Cam Back |
| 2   | Cue Cam Left |
| 3   | Cue Cam Right |
| 4   | Cue Data Projection |
| Space | Take the cued scene |

### PTZ pad

Each camera card has a joystick + zoom + focus controls.

- **Eight directional arrows** around the joystick — press and hold to
  pan/tilt; release to stop.
- **Mouse wheel over an arrow** — one short pulse in that direction. So
  scrolling wheel over UP nudges up, etc. Useful for tiny corrections.
- **ZOOM / FOCUS** buttons — same press-and-hold model. Mouse wheel
  works on these too.
- **AUTO** under FOCUS — kicks the camera back into auto-focus.

### HOME button (centre of joystick)

This replaces v1's home behaviour entirely. There's now **one home
position per camera**, captured directly:

- **Click HOME** — drives the camera to its saved home position (or to
  the factory home if nothing has been saved yet).
- **Right-click HOME → "Save Home (current position)"** — captures the
  current pan/tilt/zoom/focus as this camera's home. Overwrite any time
  by re-saving from a different position.

(There's no separate "clear home" — overwriting from a known-good
position is the recovery path.)

### Cam 1 face tracking

The **FOLLOW FACE / TRACKING** button under Cam Back's joystick toggles
the face-tracking module on the speaker camera. Local on/off only — the
camera does the actual tracking. Click again to stop.

### Data projection card controls

The right-most card has three buttons under the video:

- **Overlay** — shows the DP source on every camera scene as a
  picture-in-picture.
- **Lower Third** — shows the lower-third NDI overlay on every camera
  scene.
- **Slides** — your **preference** for which data scene the data feed
  goes to:
  - **Slides ON** → clicking the data feed live goes to *DP & Speaker*
    (slides composite with a speaker shot beside them).
  - **Slides OFF** → clicking the data feed live goes to *DP Full
    Screen* (slides only).
  - You can toggle Slides at any time, including while a camera is on
    air. The next time you take the data feed it will use the current
    setting.

If you specifically want to go to "DP Full Screen", **turn Slides off
first**, then click the data feed.

---

## Auto-queue

The right-most column on the preset grid is an **auto-queue**. It runs
a sequence of presets in order, holding each one for its configured
timeout before advancing.

- **Running / Paused** button — starts or pauses the queue.
- **Skip** button — advances to the next queued shot immediately.
- Each queue thumb shows its **timeout** in seconds; while it's the
  current shot, that number ticks down to show how long until the next
  cut.

### Operator takeover pauses the queue

If you do anything that changes the live shot while the queue is
running — clicking a thumb on a different camera, taking a different
live feed, jogging a camera that's currently on air — the queue
**pauses automatically** and a note is written to the activity log.
Resume it with the Running button.

### Resume behaviour

When you resume a paused queue, it picks up intelligently:

- **Same camera, same preset** — keeps going from where it was.
- **Same camera but you've moved it** — the queue's current shot is no
  longer accurate, so it advances to the next one.
- **Different camera is live** — takes the first cued queue item back
  to live to re-establish the run.

### Drag a thumb into the queue

Drag any preset thumb onto a queue slot to copy it in. The auto-queue
slots are just normal preset slots — you can rename them, set
individual timeouts, etc.

---

## Right-side dock — meters, health, TAKE

The right edge of the screen has:

- **Output Meters** — Church Mix, Video Mix, Backup, plus a Master that
  shows the loudest of the three. The active source has an ACTIVE badge.
- **Stream Health** — bitrate, dropped frames, congestion, total
  frames, CPU. Green dot when a value is in a healthy range.
- **TAKE** button — the mouse equivalent of pressing Space. Takes the
  cued scene live.

---

## Left-rail controls

Same kinds of toggles as v1, just laid out on the left edge:

- **Lights** — Spots, Stage, Front (church houselights / stage lights).
- **TVs** — LG Left, LG Right (the side panels).
- **Audio source** — Church Mix, Video Mix, Backup. Radio behaviour:
  picking one mutes the others.
- **Broadcast** — Record and Stream big buttons. Click to toggle. They
  light up while running.
- **PTZ Speed** — slider that scales how fast pan/tilt and zoom move
  for both the joystick and the arrow keys. 1 = crawl, 10 = sprint.
- **Emergency** — switches OBS to the holding/emergency scene and
  stops the auto-queue. Use if something goes wrong on air.
- **Lock icon** *(Ctrl-click)* — toggles **admin mode** (see below).

---

## Keyboard shortcuts

The shortcut list has been **simplified** in v2. Only the keys you
actually need during a service are mapped — there are no longer keys
for audio, lighting, or anything else that could be hit accidentally.

| Key | Action |
|-----|--------|
| 1 / 2 / 3 / 4 | Cue Cam Back / Left / Right / Data |
| Space | Take the cued scene live |
| Arrow keys | Pan / tilt the cued camera (or live camera if nothing is cued) |
| + / - | Zoom in / out |
| Escape | Clear the cue / close menus |
| ? | Open the on-screen shortcut legend |

Anything not in this list is intentionally unbound. To switch a light
or change audio source, click the button on the left rail.

---

## Admin mode

Hold **Ctrl** and click the **lock icon** in the left rail to toggle
admin mode. This unlocks:

- **Save as Default** in the thumb right-click menu — captures the
  current camera position into the slot's admin/default bank. Used for
  setting up new services or fixing presets after a camera firmware
  reset.

Anyone can use **Restore Default** to pull a slot back to its admin
default — admin mode is only required to change what that default *is*.

Click the lock again to exit admin mode.

---

## Update Presets sweep

After a camera firmware reset, after the cameras have moved, or just
once a week to keep thumbnails fresh:

1. Right-click a camera's live feed (any of the bottom cards).
2. Choose **Update Presets**.

The console will walk through every preset stored for that camera one
by one — driving the camera there, waiting for it to settle, capturing
a fresh thumbnail, and moving on. The activity log tells you which
preset is currently being updated and a small CUE marker walks across
the grid.

This may take a minute or two depending on how many presets the camera
has. Don't take any shots live during the sweep — they'll fight the
sweep's camera moves.

---

## What was removed (or moved) from v1

| v1 | v2 |
|----|----|
| Single-click thumb takes shot live | Two-click cue → take |
| "Save Camera Back / Left / Right" right-click items | Drag a live feed onto a thumb |
| "Save as Home" preset right-click item | Right-click HOME button on the PTZ pad |
| Slot-based home (preset flagged as the "home" preset) | Standalone home position per camera |
| Many keyboard shortcuts (audio, lights, scenes) | Only PTZ + cue/take keys |
| Slides toggle that auto-reverts when not on data | Slides as a sticky preference |
| Face tracking button in main toolbar | Compact toggle under Cam Back joystick |
| (Implicit) thumbs only refreshed on demand | Active thumb refreshes once a second from live video |

The data and the OBS scene names are unchanged, so v1 and v2 share the
same `settings.json`. If you set a preset in v2 it shows up in v1 and
vice-versa.

---

## Activity log

Bottom-right corner has an activity log button. Open it for a running
record of every action — scene takes, preset saves, queue events,
errors. Useful for "what just happened" diagnosis or for after-service
review.

The log only lives for the current session. Reloading the page clears
it.

---

## Troubleshooting

| Symptom | What to check |
|---------|---------------|
| Camera doesn't move when I click a preset | The preset has no saved position yet. Drive the camera there manually, then drag the live feed onto the thumb to save. |
| Thumbnails are stale | Right-click a live feed → **Update Presets** to do a full sweep, or drag the live feed onto individual thumbs. |
| Auto-queue keeps pausing | Anything that changes the live shot while the queue runs counts as a takeover. Either avoid touching live during the queue, or hit Running again to resume. |
| Slides button is on but data is at the slides-only scene | Click the data feed to actually take it — Slides is just a preference until you take the feed. |
| OBS scene won't switch | Network blip — try the action again. Each action opens a fresh OBS connection so a stuck connection clears itself. |
| "LIVE" warning on the thumb I want to click | The preset's camera is currently on air. Clicking will physically pan a live camera — make sure that's what you want, then click again. |

---

*Console version: see the asset version in the page source if support
asks. Settings file: `chatswood/.data/settings.json`. Source files in
`chatswood/v2/` are React `.jsx` files compiled in the browser via
Babel — no build step.*
