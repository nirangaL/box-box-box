const fs = require('fs');
const path = require('path');

const globalBest = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

function calcTrackStats(c, p, base, tDelta) {
    const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
    const wearAge = Math.max(0, c.age - p[16 + ti]);
    const wearEffect = (p[6 + ti] * wearAge + p[9 + ti] * wearAge * wearAge) * (1 + p[3 + ti] * tDelta);
    const lapTime = base * (1 + p[ti] + wearEffect) + (c.age === 1 ? p[12 + ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
    return { lapTime, ti, wearAge, wearEffect, age1: c.age===1, siPos: c.si>0 };
}

function calcRaceSim(c, tempDelta, base) {
    const get = (g, t, f) => {
        if(globalBest[g] && globalBest[g][t] !== undefined) return globalBest[g][t];
        if(globalBest[g] !== undefined && typeof globalBest[g] !== 'object') return globalBest[g];
        return f;
    };
    const tire = c.tire;
    const wearAge = Math.max(0, c.age - get('shelfLife', tire, 0));
    const wearEffect = (get('degr1', tire, 0)*wearAge + get('degr2', tire, 0)*wearAge*wearAge) * (1 + get('tempCoeff', tire, 0)*tempDelta);
    const lapTime = base * (1 + get('offset', tire, 0) + wearEffect) + (c.age===1?get('freshBonus', tire, 0):0) + (c.si>0&&c.age===1?get('pitExitPenalty', tire, 0):0);
    return { lapTime, tire, wearAge, wearEffect, age1: c.age===1, siPos: c.si>0 };
}

const race = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_004.json', 'utf8'));
const rc = race.race_config, base = rc.base_lap_time, temp = rc.track_temp, total = rc.total_laps;
const tDelta = temp - 30;

const c = { tire: 'SOFT', age: 7, si: 0 };
const p = [
    globalBest.offset.SOFT, globalBest.offset.MEDIUM, globalBest.offset.HARD,
    globalBest.tempCoeff.SOFT, globalBest.tempCoeff.MEDIUM, globalBest.tempCoeff.HARD,
    globalBest.degr1.SOFT, globalBest.degr1.MEDIUM, globalBest.degr1.HARD,
    globalBest.degr2.SOFT, globalBest.degr2.MEDIUM, globalBest.degr2.HARD,
    globalBest.freshBonus.SOFT, globalBest.freshBonus.MEDIUM, globalBest.freshBonus.HARD,
    globalBest.pitExitPenalty,
    globalBest.shelfLife.SOFT, globalBest.shelfLife.MEDIUM, globalBest.shelfLife.HARD,
    globalBest.queuePenalty || 0
];

console.log(calcTrackStats(c, p, base, tDelta));
console.log(calcRaceSim(c, tDelta, base));

