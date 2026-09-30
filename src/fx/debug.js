// 调试：在棋盘上陈列所有模型
import * as THREE from 'three';
import { Soldier, Cavalry, Chariot, Cannon, Elephant, Boat, GiantSword } from './models.js';

export function showcase(app, team = 0) {
  const g = new THREE.Group();
  const units = [];
  const add = (u, x, z, ry = 0) => {
    u.root.position.set(x, 0, z);
    u.root.rotation.y = ry;
    g.add(u.root);
    if (u.u) u.dissolve = -0.2;
    units.push(u);
    return u;
  };
  add(new Soldier(team, { weapon: 'spear', shield: true }), -3, 3);
  add(new Soldier(team, { weapon: 'bow' }), -2, 3);
  add(new Soldier(team, { weapon: 'sword', officer: true, cape: true }), -1, 3);
  add(new Cavalry(team), 1, 3, -0.6);
  add(new Chariot(team), 3, 2.5, -0.5);
  add(new Cannon(team), -3, -2, 0.6);
  add(new Elephant(team), 0, -2.5, 0.4);
  const b = new Boat();
  b.root.position.set(3, -0.1, 0);
  g.add(b.root);
  const s = add(new GiantSword(team), 3, -3);
  s.root.position.y = 3.9;
  app.stage.scene.add(g);
  app.stage.add((dt, t) => units.forEach((u) => u.update?.(dt, t)));
  return { group: g, units };
}
