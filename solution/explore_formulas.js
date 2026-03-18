const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
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

function simulate(race, p, mode) {
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
            const wearAge = Math.max(0, c.age - p[16+ti]);
            const wearEffect = (p[6+ti]*wearAge + p[9+ti]*wearAge*wearAge) * (1 + p[3+ti]*tDelta);
            
            if (mode === 1) { // Standard Mix
                c.time += base * (1 + p[ti] + wearEffect) + (c.age === 1 ? p[12+ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
            } else if (mode === 2) { // Full Relative
                c.time += base * (1 + p[ti] + wearEffect + (c.age === 1 ? p[12+ti] : 0)/base + (c.si > 0 && c.age === 1 ? p[15]/base : 0));
            } else if (mode === 3) { // Temp-Pace Direct
                const tempPace = p[20+ti] * tDelta;
                c.time += base * (1 + p[ti] + wearEffect + tempPace) + (c.age === 1 ? p[12+ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
            }
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time-b.time) || (a.grid-b.grid));
        pitting.forEach(c => { c.time += pit; c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++; });
    }
    return cars.sort((a,b) => (a.time-b.time) || (a.grid-b.grid)).map(x=>x.id);
}

const cases = loadTestCases();
const bestP = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;
const pArr = [bestP.offset.SOFT, bestP.offset.MEDIUM, bestP.offset.HARD, bestP.tempCoeff.SOFT, bestP.tempCoeff.MEDIUM, bestP.tempCoeff.HARD,
              bestP.degr1.SOFT, bestP.degr1.MEDIUM, bestP.degr1.HARD, bestP.degr2.SOFT, bestP.degr2.MEDIUM, bestP.degr2.HARD,
              bestP.freshBonus.SOFT, bestP.freshBonus.MEDIUM, bestP.freshBonus.HARD, bestP.pitExitPenalty,
              bestP.shelfLife.SOFT, bestP.shelfLife.MEDIUM, bestP.shelfLife.HARD, bestP.queuePenalty || 0,
              0, 0, 0 // tempPace (mode 3)
];

console.log('Formula Exploration:');
[1, 2, 3].forEach(m => {
    let ok = 0;
    for (const c of cases) if (JSON.stringify(simulate(c.input, pArr, m)) === JSON.stringify(c.expected)) ok++;
    console.log(`Mode ${m}: ${ok}/100`);
});
