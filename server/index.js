// 楚河汉界 · 联机服务器：静态文件 + WebSocket 房间（可选部署；不部署时前端自动使用公共 MQTT 中继）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { RoomHost, randomCode, PROTOCOL } from '../shared/room.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOM_TTL_MS = 30 * 60 * 1000;
const MAX_ROOMS = 5000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  let file = path.join(DIST, p);
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('请先运行 npm run build');
    return;
  }
  const ext = path.extname(file);
  const headers = { 'content-type': MIME[ext] || 'application/octet-stream' };
  headers['cache-control'] = /assets\//.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache';
  const accept = req.headers['accept-encoding'] || '';
  const compressible = /\.(html|js|css|svg|json|txt)$/.test(file);
  if (compressible && accept.includes('gzip')) {
    headers['content-encoding'] = 'gzip';
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(zlib.createGzip()).pipe(res);
  } else {
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  }
}

const rooms = new Map(); // code -> {host, sockets: Set<ws>}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/health')) {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ ok: true, ws: true, proto: PROTOCOL, rooms: rooms.size }));
    return;
  }
  serveStatic(req, res);
});

function createRoom(opts) {
  let code;
  do code = randomCode(6);
  while (rooms.has(code));
  const host = new RoomHost({ code, color: opts.color, minutes: opts.minutes, creatorId: opts.clientId });
  const room = { host, sockets: new Set(), emptySince: Date.now() };
  host.send = (clientId, msg) => {
    const data = JSON.stringify(msg);
    for (const ws of room.sockets) if (ws.clientId === clientId && ws.readyState === 1) ws.send(data);
  };
  rooms.set(code, room);
  return room;
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'create') {
      if (rooms.size >= MAX_ROOMS) {
        ws.send(JSON.stringify({ t: 'error', code: 'FULL', msg: '服务器房间已满，请稍后再试' }));
        return;
      }
      const clientId = String(msg.clientId || '').slice(0, 40);
      const room = createRoom({ color: msg.color, minutes: Math.min(60, Math.max(0, +msg.minutes || 0)), clientId });
      bind(ws, room, clientId);
      ws.send(JSON.stringify({ t: 'created', code: room.host.code }));
      return;
    }
    if (msg.t === 'join') {
      const room = rooms.get(String(msg.code || '').toUpperCase());
      if (!room) {
        ws.send(JSON.stringify({ t: 'error', code: 'NO_ROOM', msg: '房间不存在或已解散' }));
        return;
      }
      bind(ws, room, String(msg.clientId || '').slice(0, 40));
      ws.send(JSON.stringify({ t: 'joined', code: room.host.code }));
      return;
    }
    if (!ws.room) return;
    ws.room.host.handle(ws.clientId, msg);
  });
  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    room.sockets.delete(ws);
    const still = [...room.sockets].some((s) => s.clientId === ws.clientId);
    if (!still) room.host.disconnect(ws.clientId);
    if (room.sockets.size === 0) room.emptySince = Date.now();
  });
});

function bind(ws, room, clientId) {
  if (ws.room) ws.room.sockets.delete(ws);
  ws.room = room;
  ws.clientId = clientId;
  room.sockets.add(ws);
  room.emptySince = null;
}

// 心跳 + 房间计时
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    room.host.tick();
    if (room.sockets.size === 0 && room.emptySince && now - room.emptySince > ROOM_TTL_MS) rooms.delete(code);
  }
}, 1000);

server.listen(PORT, HOST, () => {
  console.log(`楚河汉界服务器已启动: http://localhost:${PORT}`);
});
