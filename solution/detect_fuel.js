const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
function loadTestCases() {
    const cases = [];
    for (let i = 1; i <= 100; i++) {
        const id = String(i).padStart(3, '0');
        const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`), 'utf8'));
        const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`), 'utf8'));
        cases.push({
            id: i,
            input,
            expected: output.finishing_positions
        });
    }
    return cases;
}

function sim(race, p, fuelFactor) {
    const rc = race.race_config;
    const base = rc.base_lap_time, temp = rc.track_temp, pit = rc.pit_lane_time, total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        const f = (total - lap) / total;
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p[16 + ti]);
            const wearEffect = (p[6 + ti] * wearAge + p[9 + ti] * wearAge * wearAge) * (1 + p[3 + ti] * tDelta);
            let lp = base * (1 + p[ti] + wearEffect + f * fuelFactor) + (c.age === 1 ? p[12 + ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
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

const sParams = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;
const p = [
    sParams.offset.SOFT, sParams.offset.MEDIUM, sParams.offset.HARD,
    sParams.tempCoeff.SOFT, sParams.tempCoeff.MEDIUM, sParams.tempCoeff.HARD,
    sParams.degr1.SOFT, sParams.degr1.MEDIUM, sParams.degr1.HARD,
    sParams.degr2.SOFT, sParams.degr2.MEDIUM, sParams.degr2.HARD,
    sParams.freshBonus.SOFT, sParams.freshBonus.MEDIUM, sParams.freshBonus.HARD,
    sParams.pitExitPenalty,
    sParams.shelfLife.SOFT, sParams.shelfLife.MEDIUM, sParams.shelfLife.HARD,
    sParams.queuePenalty || 0
];

const cases = loadTestCases();
for (const c of cases) {
    let bestF = -1, bestMatches = 0;
    // Test fuel factors that solve this case
    for (let ff = 0; ff <= 0.05; ff += 0.001) {
        // Adjust offsets to keep same average pace
        const pMod = [...p];
        pMod[0] -= ff * 0.5; pMod[1] -= ff * 0.5; pMod[2] -= ff * 0.5;
        const res = sim(c.input, pMod, ff);
        if (JSON.stringify(res) === JSON.stringify(c.expected)) {
            bestF = ff; break;
        }
    }
    if (bestF !== -1) console.log(`Case ${c.id.toString().padStart(3, '0')} PASS with fuelFactor=${bestF.toFixed(3)}`);
}
