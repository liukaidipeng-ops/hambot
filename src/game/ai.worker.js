import { AIEngine, AI_LEVELS } from '../../shared/ai.js';
import { XiangqiGame, hashBoard } from '../../shared/xiangqi.js';

const engine = new AIEngine();

self.onmessage = (e) => {
  const { id, fen, moves, level, timeMs } = e.data;
  const g = new XiangqiGame(fen);
  const past = [];
  for (const [f, t] of moves) {
    const [h, l] = hashBoard(g.board, g.turn);
    past.push({ h, l, check: g.inCheck(g.turn) });
    g.move(f, t);
  }
  const opts = { ...(AI_LEVELS[level] || AI_LEVELS.medium) };
  if (timeMs) opts.timeMs = timeMs;
  engine.setPosition(g.board, g.turn, past);
  const r = engine.think(opts);
  self.postMessage({ id, move: r.move, score: r.score, depth: r.depth });
};
