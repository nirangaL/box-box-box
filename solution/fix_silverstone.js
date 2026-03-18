const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
const p = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

function loadTestCases() {
    const cases = [];
    for (let i = 1; i <= 100; i++) {
        const id = String(i).padStart(3, '0');
        const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`), 'utf8'));
        const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`), 'utf8'));
        if (input.race_config.track === 'Silverstone') {
          cases.push({ input, expected: output.finishing_positions });
        }
    }
    return cases;
}

function simulate(race, tc, refT) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - refT;
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 'SOFT' : c.tire[0] === 'M' ? 'MEDIUM' : 'HARD';
            const wearAge = Math.max(0, c.age - p.shelfLife[ti]);
            
            // Testing Exponential or Poly Temp logic
            const wearEffect = (p.degr1[ti] * wearAge) * (Math.pow(1 + tc[ti], tDelta));
            
            c.time += base * (1 + p.offset[ti] + wearEffect) + (c.age === 1 ? p.freshBonus[ti] : 0) + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p.queuePenalty;
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

const cases = loadTestCases();
console.log(`Analyzing Silverstone Failure (N=${cases.length})...`);
for (let refT = 20; refT <= 30; refT += 5) {
    let bestOk = 0;
    for (let scale = 0.01; scale <= 0.05; scale += 0.01) {
        let ok = 0;
        const tc = [scale, scale*0.8, scale*0.6];
        for (const c of cases) if (JSON.stringify(simulate(c.input, tc, refT)) === JSON.stringify(c.expected)) ok++;
        if (ok > bestOk) bestOk = ok;
    }
    console.log(`RefT ${refT}: Max Pass ${bestOk}/${cases.length}`);
}
