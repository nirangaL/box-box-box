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
            input,
            expected: output.finishing_positions,
            expectedMap: output.finishing_positions.reduce((acc, id, rank) => { acc[id] = rank; return acc; }, {})
        });
    }
    return cases;
}

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
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p[16 + ti]);
            
            // Model C: Temp affects Pace directly
            const paceOffset = p[ti] + p[3 + ti] * tDelta;
            const wearEffect = (p[6 + ti] * wearAge + p[9 + ti] * wearAge * wearAge);
            
            let lapTime = base * (1 + paceOffset + wearEffect) + (c.age === 1 ? p[12 + ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
            c.time += lapTime;
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

const cases = loadTestCases();
const RANGES = [
    [-0.1, 0.1], [-0.1, 0.1], [-0.1, 0.1], // offsets
    [-0.01, 0.01], [-0.01, 0.01], [-0.01, 0.01], // tempCoeff on Pace
    [0, 0.05], [0, 0.05], [0, 0.05], // d1
    [0, 0.005], [0, 0.005], [0, 0.005], // d2
    [-2, 2], [-2, 2], [-2, 2], // fresh
    [-3, 3], // pitExit
    [0, 20], [5, 40], [10, 60], // shelf
    [0, 1.0] // queue
];

function score(p) {
    let exact = 0, pairs = 0;
    for (const c of cases) {
        const pred = simulate(c.input, p);
        if (JSON.stringify(pred) === JSON.stringify(c.expected)) {
            exact++;
            pairs += 190;
        } else {
             for (let i = 0; i < 20; i++) {
                const ri = c.expectedMap[pred[i]];
                for (let j = i + 1; j < 20; j++) if (ri < c.expectedMap[pred[j]]) pairs++;
            }
        }
    }
    return exact * 1e6 + pairs;
}

const popSize = 60;
let pop = Array.from({length: popSize}, () => RANGES.map(r => r[0] + Math.random()*(r[1]-r[0])));

async function main() {
    console.log('Optimizing Model C (Additive Temp Pace)...');
    let scores = pop.map(p => score(p));
    let bestIdx = scores.indexOf(Math.max(...scores));
    for (let gen = 0; gen < 2000; gen++) {
        for (let i = 0; i < popSize; i++) {
            let a,b,c;
            do{a=Math.floor(Math.random()*popSize);}while(a===i);
            do{b=Math.floor(Math.random()*popSize);}while(b===i||b===a);
            do{c=Math.floor(Math.random()*popSize);}while(c===i||c===a||c===b);
            const mutant = pop[a].map((val, idx) => {
                if (Math.random() < 0.9) {
                    let v = val + 0.8 * (pop[b][idx] - pop[c][idx]);
                    return Math.max(RANGES[idx][0], Math.min(RANGES[idx][1], v));
                }
                return pop[i][idx];
            });
            const s = score(mutant);
            if (s >= scores[i]) {
                pop[i] = mutant; scores[i] = s;
                if (s > scores[bestIdx]) {
                    bestIdx = i;
                    console.log(`Gen ${gen}: ${Math.floor(s/1e6)}/100 (pairs=${s%1e6})`);
                }
            }
        }
    }
}
main();
