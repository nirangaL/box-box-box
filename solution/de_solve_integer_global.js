const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
function loadTestCases() {
    const cases = [];
    for (let i = 1; i <= 100; i++) {
        const id = String(i).padStart(3, '0');
        const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`), 'utf8'));
        const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`), 'utf8'));
        const em = {}; output.finishing_positions.forEach((id, rank) => em[id] = rank);
        cases.push({ input, expected: output.finishing_positions, em });
    }
    return cases;
}

function simMsGlobal(race, p) {
    const rc = race.race_config, base = Math.round(rc.base_lap_time * 1000), pit = Math.round(rc.pit_lane_time * 1000), total = rc.total_laps, temp = rc.track_temp;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        // 10ms = 0.01s grid gap
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*10, stops: s.pit_stops || [], si: 0 }); 
    }
    
    // Temp effect is likely applied as an integer multiplier or offset. Let's use a pure additive ms offset.
    const tDelta = temp - 30;
    
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            
            // Base offset + Linear wear + Temp effect
            const wearMs = c.age * (p[ti*2 + 1] + Math.round(tDelta * p[6]));
            const lapTime = base + p[ti*2] + wearMs;
            
            c.time += lapTime + (c.age === 1 ? p[7] : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p[8]; 
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

const cases = loadTestCases();

function getPairScore(p) {
    let match = 0, pairs = 0;
    for (const c of cases) {
        const pred = simMsGlobal(c.input, p);
        for(let i=0; i<20; i++) {
            if(pred[i] === c.expected[i]) match++;
            for(let j=i+1; j<20; j++) if(c.em[pred[i]] < c.em[pred[j]]) pairs++;
        }
    }
    return match * 1000 + pairs;
}

let pop = Array.from({length: 30}, () => [
    -5000 + Math.random()*1000, 100 + Math.random()*200, // S
    -3000 + Math.random()*1000, 50 + Math.random()*100,  // M
    -1000 + Math.random()*1000, 10 + Math.random()*50,   // H
    Math.random()*20,  // Temp coeff (ms per degree * age)
    -500 + Math.random() * 500, // fBonus
    500 * Math.random()  // qPen ms
]);

async function solve() {
    console.log('Solving GLOBAL Integer MS Physics DE...');
    let best = 0;
    for (let gen = 0; gen < 2000; gen++) {
        for (let i = 0; i < pop.length; i++) {
            const [a, b, c] = Array.from({length: 3}, () => pop[Math.floor(Math.random()*pop.length)]);
            const mutant = a.map((v, j) => Math.round(v + 0.6 * (b[j] - c[j])));
            const s = getPairScore(mutant);
            if (s >= best) {
                best = s;
                if (s >= getPairScore(pop[i])) pop[i] = mutant;
                if (gen % 50 === 0) {
                    let passes = 0;
                    for (const c of cases) if (JSON.stringify(simMsGlobal(c.input, mutant)) === JSON.stringify(c.expected)) passes++;
                    console.log(`Gen ${gen}: Best Score ${best} | Passes ${passes}/100`);
                }
            }
        }
    }
    
    // Find final best
    let bestInd = pop[0], bestS = 0;
    pop.forEach(p => { const s = getPairScore(p); if(s>bestS) { bestS=s; bestInd=p; }});
    console.log(`\nFinal Best Parameters: ${JSON.stringify(bestInd)}`);
    let p = 0; for(const c of cases) if(JSON.stringify(simMsGlobal(c.input, bestInd))===JSON.stringify(c.expected)) p++;
    console.log(`Final Global Match: ${p}/100`);
}
solve();
