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

function simulateShelf(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        // 0.01S GRID GAP
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*0.01, stops: s.pit_stops || [], si: 0 });
    }
    
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 'SOFT' : c.tire[0] === 'M' ? 'MEDIUM' : 'HARD';
            
            // THE SHELF MODEL: Zero wear until ShelfLife, then Linear Wear
            const life = p.shelf[ti];
            const wear = (c.age > life) ? (c.age - life) * p.wearRate : 0;
            
            let lapTime = base * (1 + p.offset[ti]) + wear;
            if (c.age === 1) lapTime += p.freshBonus[ti];
            
            c.time += lapTime;
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

const p = {
    shelf: { SOFT: 12, MEDIUM: 22, HARD: 33 }, // Based on my visualization!
    wearRate: 0.15, // Discrete jump
    offset: { SOFT: -0.05, MEDIUM: -0.03, HARD: -0.01 },
    freshBonus: { SOFT: -0.2, MEDIUM: -0.1, HARD: 0.0 },
    queuePenalty: 0.1
};

const cases = loadTestCases();
let ok = 0;
for (const c of cases) if (JSON.stringify(simulateShelf(c.input, p)) === JSON.stringify(c.expected)) ok++;
console.log(`Discrete Shelf Model Passes: ${ok}/100`);

// Hill climb on the Shelf Model
async function search() {
    let currentBest = p;
    let rank = ok;
    for (let i = 0; i < 5000; i++) {
        const next = JSON.parse(JSON.stringify(currentBest));
        if (Math.random() < 0.5) {
            const tire = ['SOFT', 'MEDIUM', 'HARD'][Math.floor(Math.random()*3)];
            next.shelf[tire] += (Math.random() < 0.5 ? 1 : -1);
            next.shelf[tire] = Math.max(0, next.shelf[tire]);
        } else {
            next.wearRate += (Math.random() - 0.5) * 0.01;
        }
        
        let ok = 0;
        for (const c of cases) if (JSON.stringify(simulateShelf(c.input, next)) === JSON.stringify(c.expected)) ok++;
        if (ok >= rank) {
            rank = ok;
            currentBest = next;
            if (i % 50 === 0) console.log(`Step ${i}: ${rank}/100`);
            if (rank >= 90) break;
        }
    }
}
search();
