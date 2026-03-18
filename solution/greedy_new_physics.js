const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
const cases = [];
for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`)));
    const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`)));
    cases.push({ input, expected: output.finishing_positions, expectedRank: output.finishing_positions.reduce((acc, id, r) => { acc[id] = r; return acc; }, {}) });
}

function simulate(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let j = 1; j <= 20; j++) {
        const sj = race.strategies[`pos${j}`];
        cars.push({ id: sj.driver_id, grid: j, tire: sj.starting_tire, age: 0, time: 0, stops: sj.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        const fl = (total - lap) / total;
        for (const c of cars) {
            c.age++;
            const ti = c.tire.toUpperCase();
            const wearAge = Math.max(0, c.age - p.shelfLife[ti]);
            const wear = (p.degr1[ti]*wearAge + p.degr2[ti]*wearAge*wearAge);
            // Model E: Offset depends on TEMP
            const tempPace = (tDelta > 0 ? p.tempPlus[ti] : p.tempMinus[ti]) * Math.abs(tDelta);
            c.time += base * (1 + p.offset[ti] + tempPace + wear + p.fuelPace * fl) + (c.age === 1 ? p.freshBonus[ti] : 0) + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => { c.time += pit + q * p.queuePenalty; c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++; });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

function score(p) {
    let exact = 0, pairs = 0;
    for (const c of cases) {
        const res = simulate(c.input, p);
        if (JSON.stringify(res) === JSON.stringify(c.expected)) { exact++; pairs += 190; }
        else {
            const expMap = c.expectedRank;
            for (let j = 0; j < 20; j++) {
                const rj = expMap[res[j]];
                for (let k = j + 1; k < 20; k++) if (rj < expMap[res[k]]) pairs++;
            }
        }
    }
    return exact * 1e6 + pairs;
}

const BEST = JSON.parse(fs.readFileSync('solution/learned_params.json')).params;
let p = {
    offset: BEST.offset,
    degr1: BEST.degr1,
    degr2: BEST.degr2 || { SOFT: 0, MEDIUM: 0, HARD: 0 },
    tempPlus: JSON.parse(JSON.stringify(BEST.tempCoeff)),
    tempMinus: { SOFT: -BEST.tempCoeff.SOFT, MEDIUM: -BEST.tempCoeff.MEDIUM, HARD: -BEST.tempCoeff.HARD },
    freshBonus: BEST.freshBonus,
    shelfLife: BEST.shelfLife,
    pitExitPenalty: BEST.pitExitPenalty,
    queuePenalty: BEST.queuePenalty || 0,
    fuelWear: { SOFT: 0, MEDIUM: 0, HARD: 0 },
    fuelPace: 0
};

async function refine() {
    let bestS = score(p);
    console.log(`Initial Score: ${Math.floor(bestS/1e6)}/100 (Pairs=${bestS%1e6})`);

    const keys = [
        ['tempPlus', 'SOFT'], ['tempPlus', 'MEDIUM'], ['tempPlus', 'HARD'],
        ['tempMinus', 'SOFT'], ['tempMinus', 'MEDIUM'], ['tempMinus', 'HARD'],
        ['fuelWear', 'SOFT'], ['fuelWear', 'MEDIUM'], ['fuelWear', 'HARD'],
        ['fuelPace', null], ['queuePenalty', null]
    ];

    for (let loop = 0; loop < 20; loop++) {
        let changed = false;
        for (const [k, ti] of keys) {
            const orig = ti ? p[k][ti] : p[k];
            const steps = [0.001, 0.01, 0.1, 0.5, 1.0];
            for (const step of steps) {
                for (const sign of [1, -1]) {
                    if (ti) p[k][ti] = orig + sign * step; else p[k] = orig + sign * step;
                    const s = score(p);
                    if (s > bestS) {
                        bestS = s; changed = true;
                        console.log(`L${loop} ${k}${ti?'.'+ti:''}${sign>0?'+':'-'}${step} -> ${Math.floor(s/1e6)}/100 (Pairs=${s%1e6})`);
                        break;
                    }
                    if (ti) p[k][ti] = orig; else p[k] = orig;
                }
                if (changed) break;
            }
        }
        if (!changed) break;
    }
}
refine();
