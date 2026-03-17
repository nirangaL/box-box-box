const fs = require('fs');
const path = require('path');
const { simulate: simInSimulator } = require('./race_simulator.js');

const paramsFile = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8'));
const pMap = paramsFile.params;

// Convert learned_params object back to the array format used in test_optimizer.js
const pArr = [
  pMap.offset.SOFT, pMap.offset.MEDIUM, pMap.offset.HARD,
  pMap.tempCoeff.SOFT, pMap.tempCoeff.MEDIUM, pMap.tempCoeff.HARD,
  pMap.degr1.SOFT, pMap.degr1.MEDIUM, pMap.degr1.HARD,
  pMap.degr2.SOFT, pMap.degr2.MEDIUM, pMap.degr2.HARD,
  pMap.freshBonus.SOFT, pMap.freshBonus.MEDIUM, pMap.freshBonus.HARD,
  pMap.pitExitPenalty,
  pMap.shelfLife.SOFT, pMap.shelfLife.MEDIUM, pMap.shelfLife.HARD,
  pMap.queuePenalty || 0
];

function simInOptimizer(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const qPen = p[19];
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p[16 + ti]);
            const wearEffect = (p[6 + ti] * wearAge + p[9 + ti] * wearAge * wearAge) * (1 + p[3 + ti] * tDelta);
            c.time += base * (1 + p[ti] + wearEffect)
                     + (c.age === 1 ? p[12 + ti] : 0)
                     + (c.si > 0 && c.age === 1 ? p[15] : 0);
        }
        const pitting = [];
        for (let i = 0; i < 20; i++) {
            if (cars[i].si < cars[i].stops.length && cars[i].stops[cars[i].si].lap === lap) pitting.push(i);
        }
        if (pitting.length > 0) {
            pitting.sort((a, b) => (cars[a].time - cars[b].time) || (cars[a].grid - cars[b].grid));
            pitting.forEach((idx, q) => {
                const c = cars[idx];
                c.time += pit + q * qPen;
                c.tire = c.stops[c.si].to_tire;
                c.age = 0;
                c.si++;
            });
        }
    }
    return cars.sort((a, b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

const testId = '001';
const race = JSON.parse(fs.readFileSync(`data/test_cases/inputs/test_${testId}.json`, 'utf8'));

const predSim = simInSimulator(race);
const predOpt = simInOptimizer(race, pArr);

console.log('Optimizer Result:', JSON.stringify(predOpt));
console.log('Simulator Result:', JSON.stringify(predSim));
console.log('Mismatch?', JSON.stringify(predOpt) !== JSON.stringify(predSim));
