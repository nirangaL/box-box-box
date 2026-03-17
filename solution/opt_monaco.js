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
            const wearAge = Math.max(0, c.age - p[16+ti]);
            const wearEffect = (p[6+ti]*wearAge + p[9+ti]*wearAge*wearAge) * (1 + p[3+ti]*tDelta);
            c.time += base * (1 + p[ti] + wearEffect) + (c.age === 1 ? p[12+ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time-b.time) || (a.grid-b.grid));
        pitting.forEach(c => { c.time += pit + (p[19] || 0); c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++; });
    }
    return cars.sort((a,b) => (a.time-b.time) || (a.grid-b.grid)).map(x=>x.id);
}

async function main() {
    const cases = loadTestCases().filter(c => c.input.race_config.track === 'Monaco');
    console.log(`Optimizing for Monaco (${cases.length} cases)...`);
    
    // Grid search for offsets
    let bestOk = 0;
    for (let sOff = -0.06; sOff <= -0.04; sOff += 0.001) {
        for (let mOff = -0.05; mOff <= -0.03; mOff += 0.001) {
            const p = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;
            const pArr = [sOff, mOff, p.offset.HARD, p.tempCoeff.SOFT, p.tempCoeff.MEDIUM, p.tempCoeff.HARD,
                          p.degr1.SOFT, p.degr1.MEDIUM, p.degr1.HARD, p.degr2.SOFT, p.degr2.MEDIUM, p.degr2.HARD,
                          p.freshBonus.SOFT, p.freshBonus.MEDIUM, p.freshBonus.HARD, p.pitExitPenalty,
                          p.shelfLife.SOFT, p.shelfLife.MEDIUM, p.shelfLife.HARD, 0];
            let ok = 0;
            for(const c of cases) if(JSON.stringify(simulate(c.input, pArr)) === JSON.stringify(c.expected)) ok++;
            if(ok > bestOk) {
                bestOk = ok;
                console.log(`New Best Monaco: ${ok}/${cases.length} at sOff=${sOff.toFixed(4)}, mOff=${mOff.toFixed(4)}`);
            }
        }
    }
}
main();
