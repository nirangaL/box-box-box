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
    
    // p = [S_off, M_off, H_off, gap, temp_coeff]

    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        
        let laps_s = 0, laps_m = 0, laps_h = 0;
        let lastLap = 0;
        let tire = s.starting_tire;
        let pitCount = 0;
        
        if (s.pit_stops) {
            for (const stop of s.pit_stops) {
                const stint = stop.lap - lastLap;
                if (tire[0] === 'S') laps_s += stint;
                else if (tire[0] === 'M') laps_m += stint;
                else laps_h += stint;
                tire = stop.to_tire;
                lastLap = stop.lap;
                pitCount++;
            }
        }
        
        const finalStint = total - lastLap;
        if (tire[0] === 'S') laps_s += finalStint;
        else if (tire[0] === 'M') laps_m += finalStint;
        else laps_h += finalStint;

        // Apply no-degradation logic
        // Time = Laps * BasePace * TireMultiplier + TempEffect
        const tDelta = temp - 30; // standard delta relative to 30

        const timeS = laps_s * base * (1 + p[0] + p[3] * tDelta);
        const timeM = laps_m * base * (1 + p[1] + p[4] * tDelta);
        const timeH = laps_h * base * (1 + p[2] + p[5] * tDelta);
        
        // Try absolute offsets instead of multipliers as another param array form
        // const timeS = laps_s * (base + p[0] + p[4]*tDelta);
        
        const tot = timeS + timeM + timeH + (pitCount * pit) + ((i-1) * p[6]);
        cars.push({ id: s.driver_id, grid: i, time: tot });
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

// DE for pure pacing (NO DEGRADATION)
let pop = Array.from({length: 40}, () => [
    -0.1 + Math.random()*0.1, // S_off, e.g. -0.05
    0.0 + Math.random()*0.1, // M_off (relative to S_off later, or just independent), e.g. -0.03
    0.0 + Math.random()*0.1, // H_off
    -0.01 + Math.random()*0.02, // tempS
    -0.01 + Math.random()*0.02, // tempM
    -0.01 + Math.random()*0.02, // tempH
    0.05 // gap
]);

async function solve() {
    console.log('Solving NO DEGRADATION Global Formula...');
    let best = 0;
    for (let gen = 0; gen < 1000; gen++) {
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
    
    let bestInd = pop[0], bestS = 0;
    pop.forEach(p => { const s = getPairScore(p); if(s>bestS) { bestS=s; bestInd=p; }});
    console.log(`\nFinal Best Parameters: [${bestInd.map(x=>x.toFixed(6)).join(', ')}]`);
}
solve();
