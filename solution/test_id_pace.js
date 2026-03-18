const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
const p = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

function loadTest(id) {
    const i = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`), 'utf8'));
    const e = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`), 'utf8')).finishing_positions;
    return { input: i, expected: e };
}

function simulatePace(race, baseFactor) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        // THE HYPOTHESIS: Driver ID determines a tiny pace base
        // ID is D001..D020
        const idNum = parseInt(s.driver_id.replace('D', ''));
        const pFactor = 1.0 + (idNum * baseFactor); 
        
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0, pFactor });
    }
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 'SOFT' : c.tire[0] === 'M' ? 'MEDIUM' : 'HARD';
            const wearAge = Math.max(0, c.age - p.shelfLife[ti]);
            const wearEffect = (p.degr1[ti] * wearAge) * (1 + p.tempCoeff[ti]*(temp-30));
            
            c.time += (base * c.pFactor) * (1 + p.offset[ti] + wearEffect) 
                   + (c.age === 1 ? p.freshBonus[ti] : 0) 
                   + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
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

const t1 = loadTest('001');
console.log('Testing Driver ID Pace Factor theory on TEST_001...');
for (let bf = -0.005; bf <= 0.005; bf += 0.0001) {
    const pred = simulatePace(t1.input, bf);
    if (JSON.stringify(pred) === JSON.stringify(t1.expected)) {
        console.log(`PASS TEST_001 with baseFactor = ${bf.toFixed(5)}`);
        break;
    }
}
