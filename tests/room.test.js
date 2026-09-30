import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomHost } from '../shared/room.js';
import { sqOf, RED, BLACK } from '../shared/xiangqi.js';

function setup(opts = {}) {
  let now = 1000;
  const room = new RoomHost({ code: 'ABCDEF', color: 'red', minutes: opts.minutes || 0, creatorId: 'A', now: () => now });
  const inbox = { A: [], B: [], C: [] };
  room.send = (id, m) => inbox[id]?.push(m);
  return { room, inbox, tick: (ms) => (now += ms) };
}
const last = (arr, t) => [...arr].reverse().find((m) => m.t === t);

test('seats, start and moves', () => {
  const { room, inbox } = setup();
  room.handle('A', { t: 'hello', name: '甲' });
  assert.equal(last(inbox.A, 'state').started, false);
  room.handle('B', { t: 'hello', name: '乙' });
  const sa = last(inbox.A, 'state');
  const sb = last(inbox.B, 'state');
  assert.equal(sa.started, true);
  assert.equal(sa.you, RED);
  assert.equal(sb.you, BLACK);
  // black can't move first
  room.handle('B', { t: 'move', from: sqOf(7, 7), to: sqOf(4, 7), ply: 0 });
  assert.equal(room.game.history.length, 0);
  room.handle('A', { t: 'move', from: sqOf(7, 2), to: sqOf(4, 2), ply: 0 });
  assert.equal(room.game.history.length, 1);
  assert.equal(last(inbox.B, 'move').ply, 0);
  // spectator
  room.handle('C', { t: 'hello', name: '丙' });
  assert.equal(last(inbox.C, 'state').you, null);
});

test('undo, draw, rematch and resign', () => {
  const { room, inbox } = setup();
  room.handle('A', { t: 'hello', name: '甲' });
  room.handle('B', { t: 'hello', name: '乙' });
  room.handle('A', { t: 'move', from: sqOf(7, 2), to: sqOf(4, 2), ply: 0 });
  room.handle('B', { t: 'move', from: sqOf(7, 9), to: sqOf(6, 7), ply: 1 });
  room.handle('A', { t: 'req', kind: 'undo' });
  assert.equal(last(inbox.B, 'req').kind, 'undo');
  room.handle('B', { t: 'resp', kind: 'undo', accept: true });
  assert.equal(room.game.history.length, 0, 'undo rolls back to before requester move');
  room.handle('A', { t: 'move', from: sqOf(7, 2), to: sqOf(4, 2), ply: 0 });
  room.handle('B', { t: 'req', kind: 'draw' });
  room.handle('A', { t: 'resp', kind: 'draw', accept: true });
  assert.deepEqual(room.result, { winner: null, reason: 'agreement' });
  room.handle('A', { t: 'req', kind: 'rematch' });
  room.handle('B', { t: 'resp', kind: 'rematch', accept: true });
  assert.equal(room.result, null);
  assert.equal(last(inbox.A, 'state').you, BLACK, 'colors swap');
  room.handle('A', { t: 'resign' });
  assert.deepEqual(room.result, { winner: RED, reason: 'resign' });
});

test('clock timeout with animation grace', () => {
  const { room, inbox, tick } = setup({ minutes: 1 });
  room.handle('A', { t: 'hello', name: '甲' });
  room.handle('B', { t: 'hello', name: '乙' });
  tick(1500 + 10000);
  room.handle('A', { t: 'move', from: sqOf(7, 2), to: sqOf(4, 2), ply: 0 });
  assert.ok(Math.abs(room.clock.remaining[RED] - 50000) < 5);
  tick(800 + 59000);
  room.tick();
  assert.equal(room.result, null);
  tick(2000);
  room.tick();
  assert.deepEqual(room.result, { winner: RED, reason: 'timeout' });
  assert.ok(last(inbox.A, 'result'));
});

test('serialize / restore', () => {
  const { room } = setup();
  room.handle('A', { t: 'hello', name: '甲' });
  room.handle('B', { t: 'hello', name: '乙' });
  room.handle('A', { t: 'move', from: sqOf(7, 2), to: sqOf(4, 2), ply: 0 });
  const r2 = RoomHost.restore(JSON.parse(JSON.stringify(room.serialize())));
  assert.equal(r2.game.history.length, 1);
  assert.equal(r2.colorOf('B'), BLACK);
});
