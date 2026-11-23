/**
 * WebSocket client for the FastAPI brain.
 *
 * Owns connection state + reconnection policy; the page owns the conversation.
 * Protocol is intentionally tiny:
 *   → text_input / audio_input / set_dnd_mode / set_tts_mode / interrupt
 *   ← state_update / audio_chunk / system_message / text_input (STT echo)
 */
import { BACKEND_HTTP, BACKEND_WS } from '../../config.js';

const MAX_BACKOFF = 15000;

export class PetSocket {
  /** @type {'connecting'|'open'|'closed'} */
  phase = $state('closed');
  /** @type {'idle'|'thinking'|'speaking'} */
  brain = $state('idle');
  latency = $state(null);
  retryIn = $state(0);
  attempts = $state(0);
  error = $state(null);

  #ws = null;
  #retryTimer = 0;
  #countdownTimer = 0;
  #heartbeatTimer = 0;
  #retryAt = 0;
  #disposed = false;

  /** @param {{ onPacket?: (packet: any) => void, onOpen?: () => void, onClose?: () => void }} [handlers] */
  constructor({ onPacket, onOpen, onClose } = {}) {
    this.onPacket = onPacket || (() => {});
    this.onOpen = onOpen || (() => {});
    this.onClose = onClose || (() => {});
  }

  get open() {
    return this.#ws?.readyState === WebSocket.OPEN;
  }

  connect() {
    if (this.#disposed) return;
    if (this.#ws && (this.#ws.readyState === WebSocket.OPEN || this.#ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.#clearRetry();
    this.phase = 'connecting';
    this.error = null;
    let ws;
    try {
      ws = new WebSocket(BACKEND_WS);
    } catch (err) {
      this.#fail(err);
      this.#scheduleReconnect();
      return;
    }
    this.#ws = ws;

    ws.onopen = () => {
      if (this.#disposed || this.#ws !== ws) return;
      this.phase = 'open';
      this.attempts = 0;
      this.retryIn = 0;
      this.error = null;
      this.#startHeartbeat();
      this.onOpen();
    };

    ws.onmessage = (event) => {
      if (this.#ws !== ws) return;
      let packet;
      try {
        packet = JSON.parse(event.data);
      } catch (err) {
        console.warn('[ws] bad packet', event.data, err);
        return;
      }
      if (!packet || typeof packet !== 'object') return;
      if (packet.type === 'state_update') {
        const state = packet.payload?.state;
        if (state === 'idle' || state === 'thinking' || state === 'speaking') {
          this.brain = state;
        }
      }
      this.onPacket(packet);
    };

    ws.onerror = () => {
      if (this.#ws !== ws) return;
      this.error = '连接后端失败';
    };

    ws.onclose = () => {
      if (this.#ws !== ws) return;
      this.#ws = null;
      this.phase = 'closed';
      this.brain = 'idle';
      this.#stopHeartbeat();
      this.onClose();
      if (!this.#disposed) this.#scheduleReconnect();
    };
  }

  disconnect({ reconnect = false } = {}) {
    if (!reconnect) this.#disposed = true;
    this.#clearRetry();
    this.#stopHeartbeat();
    const ws = this.#ws;
    this.#ws = null;
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    this.phase = 'closed';
    this.brain = 'idle';
  }

  reconnectNow() {
    this.#disposed = false;
    this.disconnect({ reconnect: true });
    this.attempts = 0;
    this.retryIn = 0;
    this.connect();
  }

  send(packet) {
    if (!this.open) return false;
    try {
      this.#ws.send(JSON.stringify(packet));
      return true;
    } catch (err) {
      console.warn('[ws] send failed', err);
      return false;
    }
  }

  sendText(text) {
    return this.send({ type: 'text_input', payload: { text } });
  }

  sendAudio(audioBase64, mimeType = '') {
    return this.send({ type: 'audio_input', payload: { audio_base64: audioBase64, mime_type: mimeType } });
  }

  setDnd(enabled) {
    return this.send({ type: 'set_dnd_mode', payload: { enabled: !!enabled } });
  }

  setTts(enabled) {
    return this.send({ type: 'set_tts_mode', payload: { enabled: !!enabled } });
  }

  interrupt() {
    return this.send({ type: 'interrupt', payload: {} });
  }

  #fail(err) {
    this.error = err?.message || '无法创建 WebSocket';
    this.phase = 'closed';
    console.warn('[ws]', err);
  }

  #scheduleReconnect() {
    if (this.#disposed) return;
    this.#clearRetry();
    this.attempts += 1;
    const base = Math.min(MAX_BACKOFF, 900 * Math.pow(1.65, this.attempts - 1));
    const delay = Math.round(base + Math.random() * 450);
    this.#retryAt = Date.now() + delay;
    this.retryIn = Math.ceil(delay / 1000);
    this.#countdownTimer = window.setInterval(() => {
      this.retryIn = Math.max(0, Math.ceil((this.#retryAt - Date.now()) / 1000));
    }, 500);
    this.#retryTimer = window.setTimeout(() => {
      this.#retryTimer = 0;
      this.connect();
    }, delay);
  }

  #clearRetry() {
    clearTimeout(this.#retryTimer);
    clearInterval(this.#countdownTimer);
    this.#retryTimer = 0;
    this.#countdownTimer = 0;
    this.retryIn = 0;
  }

  #startHeartbeat() {
    this.#stopHeartbeat();
    const ping = async () => {
      const started = performance.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${BACKEND_HTTP}/ping`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) this.latency = Math.max(1, Math.round(performance.now() - started));
      } catch {
        this.latency = null;
      }
    };
    ping();
    this.#heartbeatTimer = window.setInterval(ping, 30000);
  }

  #stopHeartbeat() {
    clearInterval(this.#heartbeatTimer);
    this.#heartbeatTimer = 0;
  }

  dispose() {
    this.disconnect();
  }
}
