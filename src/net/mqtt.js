// 极简 MQTT 3.1.1 客户端（WebSocket，QoS 0），用于无服务器联机中继
const enc = new TextEncoder();
const dec = new TextDecoder();

function encodeLength(n) {
  const out = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
}

function str(s) {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 255, ...b];
}

function packet(type, body) {
  return new Uint8Array([type, ...encodeLength(body.length), ...body]);
}

export class MqttClient {
  // opts: { url, clientId, will: {topic, payload}, keepalive }
  constructor(opts) {
    this.opts = opts;
    this.handlers = new Set();
    this.pid = 1;
    this.buf = new Uint8Array(0);
    this.connected = false;
  }

  connect(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          try {
            this.ws?.close();
          } catch {}
          reject(err);
        } else resolve(this);
      };
      const timer = setTimeout(() => done(new Error('连接超时')), timeoutMs);
      let ws;
      try {
        ws = new WebSocket(this.opts.url, ['mqtt']);
      } catch (e) {
        done(e);
        return;
      }
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        const keep = this.opts.keepalive || 30;
        let flags = 0x02; // clean session
        const payload = [...str(this.opts.clientId)];
        if (this.opts.will) {
          flags |= 0x04;
          payload.push(...str(this.opts.will.topic), ...str(this.opts.will.payload));
        }
        const body = [...str('MQTT'), 4, flags, keep >> 8, keep & 255, ...payload];
        ws.send(packet(0x10, body));
      };
      ws.onmessage = (e) => {
        const chunk = new Uint8Array(e.data);
        const merged = new Uint8Array(this.buf.length + chunk.length);
        merged.set(this.buf);
        merged.set(chunk, this.buf.length);
        this.buf = merged;
        this.parse((type, body) => {
          if (type === 2) {
            if (body[1] === 0) {
              this.connected = true;
              this.startPing();
              done();
            } else done(new Error('MQTT 拒绝连接 ' + body[1]));
          }
        });
      };
      ws.onerror = () => done(new Error('网络错误'));
      ws.onclose = () => {
        const was = this.connected;
        this.connected = false;
        clearInterval(this.pingTimer);
        done(new Error('连接已关闭'));
        if (was) this.onclose?.();
      };
    });
  }

  parse(onControl) {
    let b = this.buf;
    while (b.length >= 2) {
      let mul = 1;
      let len = 0;
      let i = 1;
      let byte;
      do {
        if (i >= b.length) return;
        byte = b[i++];
        len += (byte & 127) * mul;
        mul *= 128;
      } while (byte & 128);
      if (b.length < i + len) return;
      const type = b[0] >> 4;
      const body = b.subarray(i, i + len);
      if (type === 3) {
        const tl = (body[0] << 8) | body[1];
        const topic = dec.decode(body.subarray(2, 2 + tl));
        let off = 2 + tl;
        const qos = (b[0] >> 1) & 3;
        if (qos > 0) off += 2;
        const payload = dec.decode(body.subarray(off));
        for (const h of this.handlers) h(topic, payload);
      } else onControl(type, body);
      b = b.subarray(i + len);
      this.buf = b;
    }
  }

  startPing() {
    clearInterval(this.pingTimer);
    const keep = (this.opts.keepalive || 30) * 1000;
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === 1) this.ws.send(new Uint8Array([0xc0, 0]));
    }, keep * 0.6);
  }

  subscribe(topic) {
    const id = this.pid++ & 0xffff || 1;
    const body = [id >> 8, id & 255, ...str(topic), 0];
    this.ws.send(packet(0x82, body));
  }

  publish(topic, payload) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    const body = [...str(topic), ...enc.encode(payload)];
    this.ws.send(packet(0x30, body));
    return true;
  }

  onMessage(fn) {
    this.handlers.add(fn);
  }

  close() {
    clearInterval(this.pingTimer);
    try {
      if (this.ws?.readyState === 1) this.ws.send(new Uint8Array([0xe0, 0]));
      this.ws?.close();
    } catch {}
    this.connected = false;
  }
}
