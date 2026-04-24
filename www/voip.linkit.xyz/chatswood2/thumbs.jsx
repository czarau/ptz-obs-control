// Thumbnail image wrapper. Renders a real camera snapshot served by
// ../chatswood/control_thumb.php (cache-hit first; upstream refresh handled
// separately). Falls back to a tone-on-tone placeholder until the first
// successful load.

const THUMB_ENDPOINT = (window.LS_CONFIG || {}).thumbEndpoint || '../chatswood/control_thumb.php';

// Build a cached-thumbnail URL. `presetId` is the absolute preset index
// (preset_start_index + slot), matching how control_thumb.php stores them.
function thumbUrl({ presetId, camera, fresh, ts }) {
  const stamp = ts != null ? ts : Date.now();
  if (presetId != null) {
    const cmd = fresh ? 'thumb' : 'thumb_cache';
    const cam = camera ? `&camera=${camera}` : '';
    return `${THUMB_ENDPOINT}?cmd=${cmd}&id=${presetId}${cam}&ts=${stamp}`;
  }
  if (camera != null) {
    return `${THUMB_ENDPOINT}?cmd=thumb&camera=${camera}&ts=${stamp}`;
  }
  return null;
}

function Thumb({ presetId, camera, fresh, src, alt = '', className = '', style }) {
  const url = src || thumbUrl({ presetId, camera, fresh });
  if (!url) {
    return <div className={"thumb-placeholder " + className} style={style} aria-hidden />;
  }
  const imgStyle = Object.assign(
    { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
    style || {}
  );
  return (
    <img
      className={className}
      style={imgStyle}
      src={url}
      alt={alt}
      loading="lazy"
      onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
    />
  );
}

Object.assign(window, { Thumb, thumbUrl });
