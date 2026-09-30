// AI 对手（Web Worker 中运行搜索）
export class AIPlayer {
  constructor() {
    this.worker = new Worker(new URL('./ai.worker.js', import.meta.url), { type: 'module' });
    this.seq = 0;
    this.pending = new Map();
    this.worker.onmessage = (e) => {
      const { id, move } = e.data;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      p.resolve(move ? { from: move & 127, to: move >> 7 } : null);
    };
  }

  think(game, level, timeMs) {
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      this.worker.postMessage({ id, fen: game.startFEN, moves: game.moveList(), level, timeMs });
    });
  }

  // 丢弃尚未返回的结果
  cancel() {
    for (const p of this.pending.values()) p.resolve(null);
    this.pending.clear();
  }

  dispose() {
    this.cancel();
    this.worker.terminate();
  }
}
