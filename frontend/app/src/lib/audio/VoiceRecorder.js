/** Microphone recorder for the backend's `audio_input` message. */

export function recorderSupported() {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined'
  );
}

export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export class VoiceRecorder {
  /** @param {{ onAutoStop?: (() => void) | null }} [options] */
  constructor({ onAutoStop } = {}) {
    this.onAutoStop = onAutoStop || null;
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.active = false;
    this.startedAt = 0;
    this.#timer = 0;
  }

  #timer;

  get supported() {
    return recorderSupported();
  }

  async start(maxMs = 60000) {
    if (this.active) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.stream = stream;
    try {
      this.chunks = [];
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data?.size) this.chunks.push(event.data);
      });
      recorder.start(120);
      this.recorder = recorder;
      this.active = true;
      this.startedAt = performance.now();
      this.#timer = window.setTimeout(() => {
        if (this.active) this.onAutoStop?.();
      }, maxMs);
    } catch (err) {
      // Never leak the microphone if recorder construction/start throws.
      this.#releaseStream();
      this.recorder = null;
      this.chunks = [];
      throw err;
    }
  }

  async stop() {
    if (!this.active || !this.recorder) return null;
    this.active = false;
    clearTimeout(this.#timer);
    const recorder = this.recorder;
    const shouldEmitStop = recorder.state === 'recording';
    const finished = new Promise((resolve) => {
      if (!shouldEmitStop) {
        resolve(false);
        return;
      }
      const timer = window.setTimeout(() => resolve(false), 800);
      recorder.addEventListener(
        'stop',
        () => {
          clearTimeout(timer);
          resolve(true);
        },
        { once: true }
      );
    });
    try {
      if (shouldEmitStop) recorder.stop();
    } catch {
      /* ignore */
    }
    await finished;
    this.#releaseStream();
    const type = recorder.mimeType || 'audio/webm';
    const blob = new Blob(this.chunks, { type });
    this.recorder = null;
    this.chunks = [];
    // Drop empty/near-empty captures so we never ship a drone clip upstream.
    return blob && blob.size >= 800 ? blob : null;
  }

  cancel() {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.#timer);
    try {
      this.recorder?.stop();
    } catch {
      /* ignore */
    }
    this.#releaseStream();
    this.recorder = null;
    this.chunks = [];
  }

  get elapsedMs() {
    return this.active ? performance.now() - this.startedAt : 0;
  }

  #releaseStream() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  dispose() {
    this.cancel();
    // cancel() only acts while active; release defensively under all states.
    if (this.stream) this.#releaseStream();
    this.recorder = null;
    this.chunks = [];
    this.onAutoStop = null;
  }
}
