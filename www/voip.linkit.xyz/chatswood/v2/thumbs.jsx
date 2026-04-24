// Thumbnail image wrapper. Renders a real camera snapshot served by
// ../control_thumb.php (cache-hit first; upstream refresh handled
// separately). Falls back to a tone-on-tone placeholder until the first
// successful load.

const THUMB_ENDPOINT = (window.LS_CONFIG || {}).thumbEndpoint || '../control_thumb.php';

// Build a thumbnail URL. `presetId` is the absolute preset index
// (preset_start_index + slot), matching how control_thumb.php stores them.
// Preset thumbs always read from the cached file on disk (cmd=thumb_cache);
// refreshing the cache is done separately by the JS layer (save_thumb POST
// from WebRTC, or cmd=thumb to pull from the camera) before bumping `ts` to
// force the browser to re-fetch. `fresh` remains in the shape only to make
// the legacy live-feed path explicit.
function thumbUrl({ presetId, camera, fresh, ts }) {
  const tsParam = ts != null ? `&ts=${ts}` : '';
  if (presetId != null) {
    const cam = camera ? `&camera=${camera}` : '';
    return `${THUMB_ENDPOINT}?cmd=thumb_cache&id=${presetId}${cam}${tsParam}`;
  }
  if (camera != null) {
    const cmd = fresh ? 'thumb' : 'thumb_cache';
    return `${THUMB_ENDPOINT}?cmd=${cmd}&camera=${camera}${tsParam}`;
  }
  return null;
}

function Thumb({ presetId, camera, fresh, ts, src, alt = '', className = '', style }) {
  const url = src || thumbUrl({ presetId, camera, fresh, ts });
  if (!url) {
    return <div className={"thumb-placeholder " + className} style={style} aria-hidden />;
  }
  const imgStyle = Object.assign(
    { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
    style || {}
  );
  // Note: previously we set visibility:hidden on error, but that inline style
  // persisted to the DOM node after src changed (React only updates the src
  // attribute) — so one bad load left the thumb permanently black. Now we
  // toggle visibility back on every successful load.
  return (
    <img
      key={url}
      className={className}
      style={imgStyle}
      src={url}
      alt={alt}
      loading="lazy"
      onLoad={e => { e.currentTarget.style.visibility = 'visible'; }}
      onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
    />
  );
}

Object.assign(window, { Thumb, thumbUrl });
