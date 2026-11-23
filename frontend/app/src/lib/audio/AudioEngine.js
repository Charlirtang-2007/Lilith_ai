/**
 * Audio playback + mouth-level source.
 *
 * TTS arrives as a plain URL. We play it through a single <audio> element and,
 * when the browser lets us, tap it with an AnalyserNode to drive lip sync.
 * If the analyser is unavailable (CORS/autoplay/WebKit quirks) we fall back to
 * a light synthetic mouth movement so the character still feels alive.
 */
export class AudioEngine {
  constructor() {
    this.el = null;
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.data = null;
    this.graphFailed = false;
    this.playing = false;
    this.pseudoUntil = 0;
    this.volume = 0.85;
    this.muted = false;
    this.onEnd = null;
    this.onError = null;
    this.#token = 0;
    this.#silentSince = 0;
    this.#lastLevel = 0;
  }

  #token;
  #silentSince;
  #lastLevel;

  get supported() {
    return typeof window !== 'undefined' && typeof window.Audio !== 'undefined';
  }

  #ensureElement() {
    if (this.el) return this.el;
    const el = new Audio();
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    this.el = el;
    this.#attachElementEvents();
    return el;
  }

  #attachElementEvents() {
    const el = this.el;
    if (!el) return;
    el.addEventListener('ended', () => {
      if (!this.playing) return;
      this.playing = false;
      const cb = this.onEnd;
      this.onEnd = null;
      cb?.();
    });
    el.addEventListener('error', () => {
      if (!this.playing) return;
      this.playing = false;
      const cb = this.onError;
      this.onError = null;
      cb?.(el.error);
    });
  }

  /** Call from a user gesture at least once. Safe to call repeatedly. */
  async unlock() {
    if (typeof window === 'undefined') return false;
    try {
      this.#ensureElement();
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return false;
        this.ctx = new Ctx();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.72;
        this.data = new Uint8Array(this.analyser.frequencyBinCount);
        try {
          this.source = this.ctx.createMediaElementSource(this.el);
          this.source.connect(this.analyser);
          this.analyser.connect(this.ctx.destination);
        } catch (err) {
          // CORS or platform limitation — keep plain playback working.
          this.graphFailed = true;
          this.source = null;
          console.warn('[audio] analyser unavailable:', err);
        }
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return this.ctx.state === 'running';
    } catch (err) {
      console.warn('[audio] unlock failed:', err);
      return false;
    }
  }

  setVolume(volume) {
    this.volume = Math.min(1, Math.max(0, Number(volume) || 0));
    if (this.el) this.el.volume = this.muted ? 0 : this.volume;
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.el) this.el.volume = this.muted ? 0 : this.volume;
  }

  /**
   * Play a TTS URL.
   * @param {string} url
   * @param {{ onEnd?: () => void, onError?: (err?: any) => void }} opts
   */
  async play(url, opts = {}) {
    if (!this.supported || !url) {
      this.onEnd = null;
      this.onError = null;
      return false;
    }
    this.stop({ silent: true });
    const token = ++this.#token;
    const el = this.#ensureElement();
    await this.unlock();
    if (token !== this.#token) return false;

    this.onEnd = opts.onEnd || null;
    this.onError = opts.onError || null;
    this.playing = true;
    this.#silentSince = 0;
    el.volume = this.muted ? 0 : this.volume;
    el.src = url;
    try {
      await el.play();
      return true;
    } catch (err) {
      if (token !== this.#token) return false;
      this.playing = false;
      this.onEnd = null;
      const onError = this.onError;
      this.onError = null;
      onError?.(err);
      return false;
    }
  }

  stop({ silent = false } = {}) {
    this.#token++;
    this.playing = false;
    this.pseudoUntil = 0;
    if (!silent) {
      const cb = this.onEnd;
      this.onEnd = null;
      this.onError = null;
      cb?.();
    } else {
      this.onEnd = null;
      this.onError = null;
    }
    const el = this.el;
    if (!el) return;
    try {
      el.pause();
      el.removeAttribute('src');
      el.load();
    } catch {
      /* ignore */
    }
  }

  /** Animate the mouth for replies that have no audio (or when muted). */
  startPseudo(durationMs = 2200) {
    this.pseudoUntil = performance.now() + Math.max(300, durationMs);
  }

  /** Normalised 0..1 mouth opening for the current frame. */
  getLevel() {
    const now = performance.now();
    if (this.playing && this.analyser && this.data && !this.graphFailed) {
      this.analyser.getByteTimeDomainData(this.data);
      let sum = 0;
      for (let i = 0; i < this.data.length; i++) {
        const v = (this.data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.data.length);
      let level = Math.min(1, Math.max(0, (rms - 0.012) * 5.2));
      if (level < 0.015) {
        if (!this.#silentSince) this.#silentSince = now;
      } else {
        this.#silentSince = 0;
      }
      // Long silence while the element claims to be playing: use the fallback.
      if (this.#silentSince && now - this.#silentSince > 380) {
        return this.#pseudoLevel(now, 0.55);
      }
      this.#lastLevel += (level - this.#lastLevel) * 0.45;
      return this.#lastLevel;
    }
    return this.#pseudoLevel(now, 1);
  }

  #pseudoLevel(now, amount) {
    if (now > this.pseudoUntil) return 0;
    const t = now / 1000;
    const wave =
      0.5 +
      0.28 * Math.sin(t * 13.1) +
      0.16 * Math.sin(t * 21.7 + 1.3) +
      0.06 * Math.sin(t * 37.9 + 0.7);
    return Math.max(0, Math.min(1, wave)) * 0.72 * amount;
  }

  dispose() {
    this.stop({ silent: true });
    try {
      this.source?.disconnect();
      this.analyser?.disconnect();
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.data = null;
    this.el = null;
  }
}
