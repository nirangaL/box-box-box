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
        cases.push({ input, expected: output.finishing_positions });
    }
    return cases;
}

function simulateCliff(race, lives, penalty) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const compoundName = ['SOFT', 'MEDIUM', 'HARD'][ti];
            
            // Standard linear wear + CLIFF
            const wearAge = Math.max(0, c.age - p.shelfLife[compoundName]);
            const wearEffect = (p.degr1[compoundName] * wearAge) * (1 + p.tempCoeff[compoundName]*(temp-30));
            
            let lapTime = base * (1 + p.offset[compoundName] + wearEffect) 
                   + (c.age === 1 ? p.freshBonus[compoundName] : 0) 
                   + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
            
            if (c.age > lives[ti]) lapTime += penalty;
            
            c.time += lapTime;
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * (p.queuePenalty || 0);
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

const cases = loadTestCases();
console.log('Testing Tire Cliff Theory...');

for (let sLife = 10; sLife <= 20; sLife += 2) {
    for (let mLife = 20; mLife <= 30; mLife += 2) {
        let ok = 0;
        const lives = [sLife, mLife, 100]; // Assume HARD has no cliff
        for (const c of cases) if (JSON.stringify(simulateCliff(c.input, lives, 2.0)) === JSON.stringify(c.expected)) ok++;
        console.log(`Cliff S=${sLife} M=${mLife}: ${ok}/100`);
    }
}
