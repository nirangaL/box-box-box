const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
const globalBest = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

function loadTestCases() {
    const cases = [];
    for (let i = 1; i <= 100; i++) {
        const id = String(i).padStart(3, '0');
        const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`), 'utf8'));
        const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`), 'utf8'));
        cases.push({ input, expected: output.finishing_positions });
    }
    return cases;
}

function simulate(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p[16 + ti]);
            const wearEffect = (p[6 + ti] * wearAge + p[9 + ti] * wearAge * wearAge) * (1 + p[3 + ti] * tDelta);
            c.time += base * (1 + p[ti] + wearEffect) + (c.age === 1 ? p[12 + ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a, b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c) => {
            c.time += pit + (p[19] || 0); // Single qPen for simplicity here
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

const cases = loadTestCases();
const tracks = [...new Set(cases.map(c => c.input.race_config.track))];

console.log('Per-Track Best Scores using Global Params:');
tracks.forEach(t => {
    const tCases = cases.filter(c => c.input.race_config.track === t);
    let ok = 0;
    const pArr = [
        globalBest.offset.SOFT, globalBest.offset.MEDIUM, globalBest.offset.HARD,
        globalBest.tempCoeff.SOFT, globalBest.tempCoeff.MEDIUM, globalBest.tempCoeff.HARD,
        globalBest.degr1.SOFT, globalBest.degr1.MEDIUM, globalBest.degr1.HARD,
        globalBest.degr2.SOFT, globalBest.degr2.MEDIUM, globalBest.degr2.HARD,
        globalBest.freshBonus.SOFT, globalBest.freshBonus.MEDIUM, globalBest.freshBonus.HARD,
        globalBest.pitExitPenalty,
        globalBest.shelfLife.SOFT, globalBest.shelfLife.MEDIUM, globalBest.shelfLife.HARD,
        globalBest.queuePenalty || 0
    ];
    tCases.forEach(c => {
        if (JSON.stringify(simulate(c.input, pArr)) === JSON.stringify(c.expected)) ok++;
    });
    console.log(`${t.padEnd(12)}: ${ok}/${tCases.length}`);
});
