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
const cases = loadTestCases();

function calcTime(race, p) {
    const rc = race.race_config;
    const base = rc.base_lap_time;
    const total = rc.total_laps;
    const temp = rc.track_temp;
    const pit = rc.pit_lane_time;
    // p = [S_off, M_off, H_off, S_deg, M_deg, H_deg, temp_S, temp_M, temp_H] 

    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        const tire1 = s.starting_tire;
        const tire2 = s.pit_stops && s.pit_stops.length > 0 ? s.pit_stops[0].to_tire : tire1;
        const pitLap = s.pit_stops && s.pit_stops.length > 0 ? s.pit_stops[0].lap : total;
        
        const ti1 = tire1[0] === 'S' ? 0 : tire1[0] === 'M' ? 1 : 2;
        const ti2 = tire2[0] === 'S' ? 0 : tire2[0] === 'M' ? 1 : 2;
        
        // Stint 1
        const L1 = pitLap;
        let time1 = L1 * (base + p[ti1] + p[ti1 + 6] * (temp - 30));
        time1 += p[ti1 + 3] * L1 * (L1 + 1) / 2; // linear degradation sum
        
        // Stint 2
        const L2 = total - pitLap;
        let time2 = 0;
        if (L2 > 0) {
            time2 = L2 * (base + p[ti2] + p[ti2 + 6] * (temp - 30));
            time2 += p[ti2 + 3] * L2 * (L2 + 1) / 2;
            time2 += pit; // pit stop cost
        }

        cars.push({ id: s.driver_id, grid: i, time: time1 + time2 + (i-1)*0.01 }); // grid tie breaker
    }
    
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

function getPairScore(p) {
    let match = 0;
    for (const c of cases) {
        if(JSON.stringify(calcTime(c.input, p)) === JSON.stringify(c.expected)) match++;
    }
    return match;
}

// DE for analytical linear formula
let pop = Array.from({length: 50}, () => [
    -5 + Math.random()*2, -3 + Math.random()*2, -1 + Math.random()*2, // offsets
    0.1 + Math.random()*0.1, 0.05 + Math.random()*0.1, 0.01 + Math.random()*0.05, // deg
    0.05, 0.05, 0.05 // temp coeff
]);

async function solve() {
    console.log('Solving Analytical Linear Formula...');
    let best = 0;
    for (let gen = 0; gen < 5000; gen++) {
        for (let i = 0; i < pop.length; i++) {
            const [a, b, c] = Array.from({length: 3}, () => pop[Math.floor(Math.random()*pop.length)]);
            const mutant = a.map((v, j) => v + 0.6 * (b[j] - c[j]));
            const s = getPairScore(mutant);
            if (s > best) {
                best = s;
                console.log(`Gen ${gen}: Best Score ${best}/100`);
            }
            if (s >= getPairScore(pop[i])) pop[i] = mutant;
        }
    }
}
solve();
