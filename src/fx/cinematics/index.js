// 注册各兵种的战斗电影
import { KING, ADVISOR, ELEPHANT, HORSE, ROOK, CANNON, PAWN } from '../../../shared/xiangqi.js';
import { cannonStrike } from './cannon.js';
import { chariotCharge } from './chariot.js';
import { cavalrySlash } from './cavalry.js';
import { march, phalanx } from './infantry.js';
import { elephantStomp } from './elephant.js';
import { arrowVolley } from './archers.js';
import { heavenSword } from './general.js';
import { boatCrossing } from './boat.js';

export function registerCinematics(fx) {
  fx.register(CANNON, cannonStrike);
  fx.register(ROOK, chariotCharge);
  fx.register(HORSE, cavalrySlash);
  fx.register(PAWN, phalanx);
  fx.register(ELEPHANT, elephantStomp);
  fx.register(ADVISOR, arrowVolley);
  fx.register(KING, heavenSword);
  fx.register('march', march);
  fx.register('boat', boatCrossing);
}
