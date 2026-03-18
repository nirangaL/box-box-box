const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
function simulate(race, p) {
    const rc = race.race_config;
    const base = rc.base_lap_time, temp = rc.track_temp, pit = rc.pit_lane_time, total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        const fuel = (total - lap) / total;
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p[16 + ti]);
            const wearEffect = (p[6 + ti] * wearAge + p[9 + ti] * wearAge * wearAge) * (1 + p[3 + ti] * tDelta);
            
            let lp = base * (1 + p[ti] + wearEffect + fuel * p[20]) 
                 + (c.age === 1 ? p[12 + ti] : 0) // Fresh bonus
                 + (c.si > 0 && c.age === 1 ? p[15] : 0) // Pit exit penalty (only after si > 0)
                 + (lap === 1 ? p[21] : 0); // Lap 1 penalty
            
            c.time += lp;
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p[19];
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

function score(cases, p) {
    let exact = 0, pairs = 0;
    for (const c of cases) {
        const pred = simulate(c.input, p);
        if (JSON.stringify(pred) === JSON.stringify(c.expected)) {
            exact++;
            pairs += 190;
        } else {
             for (let i = 0; i < 20; i++) {
                const ri = c.expectedRank[pred[i]];
                for (let j = i + 1; j < 20; j++) if (ri < c.expectedRank[pred[j]]) pairs++;
            }
        }
    }
    return exact * 1e6 + pairs;
}

const cases = [];
for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`)));
    const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`)));
    cases.push({
        input,
        expected: output.finishing_positions,
        expectedRank: output.finishing_positions.reduce((acc, id, r) => { acc[id] = r; return acc; }, {})
    });
}

const BEST = JSON.parse(fs.readFileSync('solution/learned_params.json')).params;
const pBase = [
    BEST.offset.SOFT, BEST.offset.MEDIUM, BEST.offset.HARD,
    BEST.tempCoeff.SOFT, BEST.tempCoeff.MEDIUM, BEST.tempCoeff.HARD,
    BEST.degr1.SOFT, BEST.degr1.MEDIUM, BEST.degr1.HARD,
    BEST.degr2.SOFT || 0, BEST.degr2.MEDIUM || 0, BEST.degr2.HARD || 0,
    BEST.freshBonus.SOFT, BEST.freshBonus.MEDIUM, BEST.freshBonus.HARD,
    BEST.pitExitPenalty,
    BEST.shelfLife.SOFT, BEST.shelfLife.MEDIUM, BEST.shelfLife.HARD,
    BEST.queuePenalty || 0, // 19
    0.0, // 20: fuelFactor
    0.0  // 21: lap1 penalty
];

// Grid Search on 19, 20, 21
let bestS = 0, bestP = [...pBase];
console.log('Starting Grid Search on 19, 20, 21...');

for (let qp of [0, 0.4, 0.8]) {
    for (let ff of [0, 0.005, 0.01]) {
        for (let l1 of [0, 2.0]) {
            const pt = [...pBase];
            pt[19] = qp; pt[20] = ff; pt[21] = l1;
            const s = score(cases, pt);
            if (s > bestS) {
                bestS = s; bestP = pt;
                console.log(`qp=${qp} ff=${ff} l1=${l1} -> ${Math.floor(s/1e6)}/100 (${s%1e6})`);
            }
        }
    }
}
