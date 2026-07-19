const GUM_TIMEOUT_MS = 20000;

function namedError(name: string, message: string): Error {
  return Object.assign(new Error(message), { name });
}

/**
 * getUserMedia with a hard timeout. A wedged device driver (seen on Chrome +
 * Windows) can leave getUserMedia pending for ~60s with the device indicator
 * stuck on; this rejects at 20s instead, and stops any stream that resolves
 * after we've already given up so nothing leaks.
 */
function gum(constraints: MediaStreamConstraints): Promise<MediaStream> {
  let timedOut = false;
  const real = navigator.mediaDevices.getUserMedia(constraints).then((s) => {
    if (timedOut) { s.getTracks().forEach((t) => t.stop()); throw namedError('AbortError', 'stream resolved after timeout'); }
    return s;
  });
  const timeout = new Promise<MediaStream>((_, reject) =>
    setTimeout(() => { timedOut = true; reject(namedError('TimeoutError', 'getUserMedia timed out')); }, GUM_TIMEOUT_MS));
  return Promise.race([real, timeout]);
}

/**
 * Acquire mic/camera, robust across browsers.
 *
 * Combined `getUserMedia({audio, video})` is the standard path and the one
 * Chrome handles reliably — so we try it FIRST. Only some Windows/Edge setups
 * where the mic and camera share a driver reject the combined open with
 * `NotReadableError` even though each device works alone; there (and only
 * there) we fall back to acquiring the two devices separately and merging.
 *
 * (An earlier version did the split unconditionally — it fixed Edge but made
 * Chrome hang, because the second sequential getUserMedia stalls there.)
 */
/** Drop deviceId pins so the request falls back to the default devices. */
function stripPins(c: MediaStreamConstraints): MediaStreamConstraints {
  const strip = (v: MediaStreamConstraints['audio']) =>
    typeof v === 'object' && v !== null && 'deviceId' in v ? true : v;
  return { audio: strip(c.audio), video: strip(c.video) };
}

/**
 * Chrome-on-Windows can fail to start one specific camera at all
 * (`AbortError: Timeout starting video source`) while every other camera on
 * the machine works — seen with IR/Windows Hello and virtual cameras, and the
 * same device fine in Edge. When the requested camera times out, try each
 * remaining camera in turn instead of giving up.
 */
async function tryEachCamera(constraints: MediaStreamConstraints, orig: unknown): Promise<MediaStream> {
  let cams: MediaDeviceInfo[] = [];
  try { cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); } catch { /* enumerate unavailable */ }
  const failedId = typeof constraints.video === 'object' ? (constraints.video.deviceId as any)?.exact : undefined;
  for (const cam of cams) {
    if (!cam.deviceId || cam.deviceId === failedId) continue;
    console.warn('[media] video source timed out, trying camera:', cam.label || cam.deviceId);
    try {
      return await gum({ ...constraints, video: { deviceId: { exact: cam.deviceId } } });
    } catch { /* next camera */ }
  }
  throw orig;
}

const isVideoTimeout = (err: any, c: MediaStreamConstraints) =>
  !!c.video && (err?.name === 'AbortError' || err?.name === 'TimeoutError');

export async function getMediaStream(constraints: MediaStreamConstraints): Promise<MediaStream> {
  // Single-device requests (audio-only or video-only) have nothing to split,
  // but still deserve the missing/wedged-device fallbacks.
  if (!constraints.video || !constraints.audio) {
    try {
      return await gum(constraints);
    } catch (err: any) {
      if (err?.name === 'OverconstrainedError') {
        console.warn('[media] pinned device unavailable, retrying with defaults');
        return gum(stripPins(constraints));
      }
      if (isVideoTimeout(err, constraints)) return tryEachCamera(constraints, err);
      throw err;
    }
  }

  try {
    return await gum(constraints);
  } catch (err: any) {
    // Saved device no longer exists (unplugged / other-profile id) — retry
    // once with the pins stripped so we use the defaults instead of failing.
    if (err?.name === 'OverconstrainedError') {
      console.warn('[media] pinned device unavailable, retrying with defaults');
      return gum(stripPins(constraints));
    }
    // Chrome "Timeout starting video source" — rotate through other cameras.
    if (isVideoTimeout(err, constraints)) return tryEachCamera(constraints, err);
    if (err?.name !== 'NotReadableError') {
      console.warn('[media] getUserMedia failed:', err?.name, err?.message);
      throw err;
    }
    console.warn('[media] combined getUserMedia hit NotReadableError, retrying audio+video separately');
    const video = await gum({ video: constraints.video });
    try {
      const audio = await gum({ audio: constraints.audio });
      return new MediaStream([...video.getVideoTracks(), ...audio.getAudioTracks()]);
    } catch (e) {
      // Don't leave the camera open with nothing referencing it.
      video.getTracks().forEach((t) => t.stop());
      throw e;
    }
  }
}

// deviceId is pinned with `exact`: `ideal` is only a hint and browsers (Edge
// observed) will silently pick a different camera, which defeats the Settings
// choice. If the exact device is absent (unplugged / id from another browser
// profile), getMediaStream catches the OverconstrainedError and retries once
// with the pin stripped, so it degrades to the default instead of failing.

/** Audio constraint honoring the microphone chosen in Settings (localStorage). */
export function savedAudioConstraint(): MediaTrackConstraints | boolean {
  const saved = window.localStorage.getItem('najva-micIn');
  return saved && saved !== 'System default' && saved !== 'Built-in microphone' ? { deviceId: { exact: saved } } : true;
}

/** Video constraint honoring the camera chosen in Settings (localStorage). */
export function savedVideoConstraint(): MediaTrackConstraints | boolean {
  const saved = window.localStorage.getItem('najva-camDev');
  return saved && saved !== 'System default' ? { deviceId: { exact: saved } } : true;
}

/** Human-readable reason for a getUserMedia failure, for user-facing messages. */
export function mediaErrorMessage(err: any): string {
  switch (err?.name) {
    case 'NotReadableError':
      return 'Could not start the camera or microphone. It may be in use by another app or browser tab — close those and try again.';
    case 'NotAllowedError':
      return 'Camera/microphone permission was denied. Allow access and try again.';
    case 'NotFoundError':
      return 'No camera or microphone was found.';
    case 'OverconstrainedError':
      return 'The selected camera or microphone is unavailable. Pick a different device in Settings.';
    case 'AbortError':
    case 'TimeoutError':
      return 'The camera did not respond (no working camera could be started). Close other apps using it, pick a different camera in Settings, or reconnect the device.';
    default:
      return 'Could not access the camera or microphone.';
  }
}
