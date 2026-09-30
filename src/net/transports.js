// 联机传输层：
//  1) ServerTransport —— 连接自建 Node 服务器（/ws），服务器运行房间逻辑
//  2) RelayTransport  —— 无服务器模式：通过公共 MQTT Broker 中继，房主浏览器运行房间逻辑
import { MqttClient } from './mqtt.js';
import { RoomHost, randomCode, CODE_ALPHABET } from '../../shared/room.js';

// 可用 ?broker=wss://... 指定自建 MQTT Broker（需支持 WebSocket）
const customBroker = new URLSearchParams(location.search).get('broker');
export const BROKERS = customBroker
  ? [customBroker]
  : ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const TOPIC = 'chuhan3d/v1/';
const HOST_KEY = 'chuhan3d.host.';

// 可通过构建变量 VITE_SERVER_URL 或 URL 参数 ?server=wss://... 指定服务器
export async function detectServer() {
  const params = new URLSearchParams(location.search);
  const explicit = params.get('server') || import.meta.env.VITE_SERVER_URL;
  if (explicit) return explicit.replace(/^http/, 'ws').replace(/\/$/, '') + (explicit.endsWith('/ws') ? '' : '/ws');
  if (params.get('relay')) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(new URL('api/health', location.href), { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json();
    if (j && j.ws) {
      const u = new URL('ws', location.href);
      u.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return u.href;
    }
  } catch {}
  return null;
}

// ---------------- 自建服务器 ----------------
export class ServerTransport {
  constructor(url, clientId) {
    this.url = url;
    this.clientId = clientId;
    this.onMessage = () => {};
    this.onStatus = () => {};
    this.closed = false;
    this.queue = [];
  }

  open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      let opened = false;
      const t = setTimeout(() => {
        if (!opened) {
          ws.close();
          reject(new Error('连接服务器超时'));
        }
      }, 8000);
      ws.onopen = () => {
        opened = true;
        clearTimeout(t);
        this.onStatus('online');
        for (const m of this.queue.splice(0)) ws.send(m);
        resolve();
      };
      ws.onmessage = (e) => {
        let msg;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        this.onMessage(msg);
      };
      ws.onclose = () => {
        clearTimeout(t);
        if (!opened) reject(new Error('无法连接服务器'));
        if (this.closed) return;
        this.onStatus('offline');
        this.reconnect();
      };
      ws.onerror = () => {};
    });
  }

  async reconnect() {
    let delay = 1000;
    while (!this.closed) {
      await new Promise((r) => setTimeout(r, delay));
      if (this.closed) return;
      try {
        await this.open();
        if (this.code) this.raw({ t: 'join', code: this.code, clientId: this.clientId });
        this.onStatus('reconnected');
        return;
      } catch {
        delay = Math.min(8000, delay * 1.6);
      }
    }
  }

  raw(msg) {
    const s = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === 1) this.ws.send(s);
    else this.queue.push(s);
  }

  async create(opts) {
    await this.open();
    return new Promise((resolve, reject) => {
      const prev = this.onMessage;
      const t = setTimeout(() => reject(new Error('创建房间超时')), 8000);
      this.onMessage = (m) => {
        if (m.t === 'created') {
          clearTimeout(t);
          this.code = m.code;
          this.onMessage = prev;
          resolve(m.code);
        } else if (m.t === 'error') {
          clearTimeout(t);
          reject(new Error(m.msg));
        }
      };
      this.raw({ t: 'create', clientId: this.clientId, color: opts.color, minutes: opts.minutes });
    });
  }

  async join(code) {
    await this.open();
    return new Promise((resolve, reject) => {
      const prev = this.onMessage;
      const t = setTimeout(() => reject(new Error('加入房间超时')), 8000);
      this.onMessage = (m) => {
        if (m.t === 'joined') {
          clearTimeout(t);
          this.code = m.code;
          this.onMessage = prev;
          resolve(m.code);
        } else if (m.t === 'error') {
          clearTimeout(t);
          reject(new Error(m.msg));
        }
      };
      this.raw({ t: 'join', code, clientId: this.clientId });
    });
  }

  send(msg) {
    this.raw(msg);
  }

  close() {
    this.closed = true;
    try {
      this.raw({ t: 'bye' });
      this.ws?.close();
    } catch {}
  }
}

// ---------------- MQTT 中继 ----------------
function brokerOf(code) {
  const i = CODE_ALPHABET.indexOf(code[0]);
  return BROKERS[Math.max(0, i) % BROKERS.length];
}

export class RelayTransport {
  constructor(clientId) {
    this.clientId = clientId;
    this.onMessage = () => {};
    this.onStatus = () => {};
    this.closed = false;
    this.host = null;
    this.lastHostSeen = 0;
    // 手机切到微信等 App 再回来时，连接可能已被系统挂起：立即检查并补发
    this._onVis = () => {
      if (document.hidden || this.closed || !this.client) return;
      if (!this.client.connected || this.client.ws?.readyState !== 1) {
        try {
          this.client.ws?.close();
        } catch {}
        this.onBrokerLost();
      } else if (this.isHost) this.beat();
      else this.send({ t: 'sync' });
    };
    document.addEventListener('visibilitychange', this._onVis);
  }

  async connectBroker(url, will) {
    const client = new MqttClient({
      url,
      clientId: 'ch3d_' + this.clientId.slice(0, 10) + '_' + Math.random().toString(36).slice(2, 7),
      keepalive: 30,
      will,
    });
    await client.connect(8000);
    return client;
  }

  // 房主：挑选可用 broker，生成与之对应的房间号
  async create(opts) {
    let lastErr;
    const order = BROKERS.map((_, i) => i);
    for (const bi of order) {
      const first = pickFirstIndex(bi);
      const code = randomCode(6, first);
      try {
        await this.startHost(code, new RoomHost({ code, color: opts.color, minutes: opts.minutes, creatorId: this.clientId }));
        return code;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('无法连接联机中继');
  }

  async startHost(code, room) {
    this.code = code;
    this.isHost = true;
    const base = TOPIC + code;
    this.client = await this.connectBroker(brokerOf(code), { topic: base + '/g', payload: JSON.stringify({ to: '*', m: { t: 'host_gone' } }) });
    this.client.subscribe(base + '/h');
    this.host = room;
    room.send = (to, m) => {
      if (to === this.clientId) {
        queueMicrotask(() => this.onMessage(m));
        return;
      }
      this.client.publish(base + '/g', JSON.stringify({ to, m }));
    };
    this.client.onMessage((topic, payload) => {
      let d;
      try {
        d = JSON.parse(payload);
      } catch {
        return;
      }
      if (!d || !d.from || !d.m || d.from === this.clientId) return;
      room.handle(d.from, d.m);
      this.persist();
    });
    this.client.onclose = () => this.onBrokerLost();
    // 定时：超时判定、心跳、掉线检测
    this.tickTimer = setInterval(() => {
      room.tick();
      const now = Date.now();
      for (const c of room.clients.values()) {
        if (c.id !== this.clientId && c.online && now - c.lastSeen > 25000) room.disconnect(c.id);
      }
      if (now - (this._lastPing || 0) > 6000) {
        this._lastPing = now;
        this.beat();
      }
      this.persist();
    }, 1000);
    this.onStatus('online');
  }

  // 心跳：带上当前手数，客户端据此发现丢包并补发 / 同步
  beat() {
    const room = this.host;
    if (!room || !this.client) return;
    this.client.publish(TOPIC + this.code + '/g', JSON.stringify({ to: '*', m: { t: 'hostbeat', ply: room.game.history.length, started: room.started, done: !!room.result } }));
  }

  persist() {
    if (!this.host) return;
    const now = Date.now();
    if (now - (this._lastSave || 0) < 800) return;
    this._lastSave = now;
    try {
      localStorage.setItem(HOST_KEY + this.code, JSON.stringify(this.host.serialize()));
    } catch {}
  }

  // 若本机曾是该房间房主（例如刷新了页面），恢复房主身份
  static savedHost(code) {
    try {
      const d = JSON.parse(localStorage.getItem(HOST_KEY + code));
      if (d && Date.now() - d.savedAt < 6 * 3600 * 1000) return d;
    } catch {}
    return null;
  }

  async join(code) {
    this.code = code;
    const saved = RelayTransport.savedHost(code);
    if (saved && saved.creatorId === this.clientId) {
      await this.startHost(code, RoomHost.restore(saved));
      return code;
    }
    this.isHost = false;
    const base = TOPIC + code;
    this.client = await this.connectBroker(brokerOf(code), { topic: base + '/h', payload: JSON.stringify({ from: this.clientId, m: { t: 'bye' } }) });
    this.client.subscribe(base + '/g');
    this.client.onMessage((topic, payload) => {
      let d;
      try {
        d = JSON.parse(payload);
      } catch {
        return;
      }
      if (!d || !d.m) return;
      if (d.to !== '*' && d.to !== this.clientId) return;
      this.lastHostSeen = Date.now();
      if (d.m.t === 'hostbeat') {
        if (this.hostLost) {
          this.hostLost = false;
          this.onStatus('reconnected');
          this.send({ t: 'sync' });
        }
        this.onMessage({ t: 'beat', ply: d.m.ply, started: d.m.started, done: d.m.done });
        return;
      }
      if (d.m.t === 'host_gone') {
        this.hostLost = true;
        this.onStatus('host_offline');
        return;
      }
      this.onMessage(d.m);
    });
    this.client.onclose = () => this.onBrokerLost();
    this.guestTimer = setInterval(() => {
      this.send({ t: 'ping', ts: Date.now() });
      if (this.lastHostSeen && Date.now() - this.lastHostSeen > 25000 && !this.hostLost) {
        this.hostLost = true;
        this.onStatus('host_offline');
      }
    }, 8000);
    this.onStatus('online');
    return code;
  }

  async onBrokerLost() {
    if (this.closed || this._reconnecting) return;
    this._reconnecting = true;
    try {
      await this.reconnectLoop();
    } finally {
      this._reconnecting = false;
    }
  }

  async reconnectLoop() {
    this.onStatus('offline');
    let delay = 1000;
    while (!this.closed) {
      await new Promise((r) => setTimeout(r, delay));
      if (this.closed) return;
      try {
        clearInterval(this.tickTimer);
        clearInterval(this.guestTimer);
        if (this.isHost) {
          await this.startHost(this.code, this.host);
          this.beat();
          this.host.broadcastState();
        } else {
          await this.join(this.code);
          this.send({ t: 'hello', name: this.lastName });
        }
        this.onStatus('reconnected');
        return;
      } catch {
        delay = Math.min(10000, delay * 1.6);
      }
    }
  }

  send(msg) {
    if (msg.t === 'hello') this.lastName = msg.name;
    if (this.isHost) {
      // 房主本地直接处理
      queueMicrotask(() => {
        this.host.handle(this.clientId, msg);
        this.persist();
      });
      return;
    }
    this.client?.publish(TOPIC + this.code + '/h', JSON.stringify({ from: this.clientId, m: msg }));
  }

  close() {
    this.closed = true;
    document.removeEventListener('visibilitychange', this._onVis);
    clearInterval(this.tickTimer);
    clearInterval(this.guestTimer);
    try {
      if (!this.isHost) this.send({ t: 'bye' });
    } catch {}
    setTimeout(() => this.client?.close(), 100);
  }
}

function pickFirstIndex(brokerIndex) {
  const options = [];
  for (let i = 0; i < CODE_ALPHABET.length; i++) if (i % BROKERS.length === brokerIndex) options.push(i);
  return options[Math.floor(Math.random() * options.length)];
}
