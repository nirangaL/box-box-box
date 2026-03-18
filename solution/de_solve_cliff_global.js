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

function simCliffGlobal(race, p) {
    const rc = race.race_config, base = rc.base_lap_time, pit = rc.pit_lane_time, total = rc.total_laps, temp = rc.track_temp;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*0.01, stops: s.pit_stops || [], si: 0 }); 
    }
    
    const tDelta = temp - 30; // Use temp to modify the CLIFF EDGE or the LOSS RATE
    
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            
            // Adjust cliff based on temp. Lower temp = longer cliff.
            const cliffEdge = p[ti] - tDelta * p[9];
            
            let lapTime = base;
            if (c.age > cliffEdge) {
                 lapTime += p[ti+3] * (c.age - Math.max(0, cliffEdge));
            } else {
                 lapTime += p[ti+6];
            }
            c.time += lapTime;
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p[10]; 
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

const cases = loadTestCases();

function getPairScore(p) {
    let match = 0, pairs = 0;
    for (const c of cases) {
        const pred = simCliffGlobal(c.input, p);
        for(let i=0; i<20; i++) {
            if(pred[i] === c.expected[i]) match++;
            for(let j=i+1; j<20; j++) if(c.em[pred[i]] < c.em[pred[j]]) pairs++;
        }
    }
    return match * 1000 + pairs;
}

let pop = Array.from({length: 40}, () => [
    10+Math.random()*5, 20+Math.random()*10, 30+Math.random()*10, // cliffs (at 30C)
    0.1+Math.random()*0.5, 0.05+Math.random()*0.3, 0.02+Math.random()*0.2, // cliff loss
    -1+Math.random(), -0.5+Math.random(), -0.2+Math.random(), // base offset
    Math.random()*0.5 + 0.5, // Temp impact on cliff edge (laps per degree)
    0.5 // qPen
]);

async function solve() {
    console.log('Solving Step/Cliff Global DE...');
    let best = 0;
    for (let gen = 0; gen < 2000; gen++) {
        for (let i = 0; i < pop.length; i++) {
            const [a, b, c] = Array.from({length: 3}, () => pop[Math.floor(Math.random()*pop.length)]);
            const mutant = a.map((v, j) => v + 0.6 * (b[j] - c[j]));
            const s = getPairScore(mutant);
            if (s >= best) {
                best = s;
                if (s >= getPairScore(pop[i])) pop[i] = mutant;
                if (gen % 50 === 0) {
                    let passes = 0;
                    for (const c of cases) if (JSON.stringify(simCliffGlobal(c.input, mutant)) === JSON.stringify(c.expected)) passes++;
                    console.log(`Gen ${gen}: Best Score ${best} | Passes ${passes}/100`);
                }
            }
        }
    }
    
    // Find final best
    let bestInd = pop[0], bestS = 0;
    pop.forEach(p => { const s = getPairScore(p); if(s>bestS) { bestS=s; bestInd=p; }});
    console.log(`\nFinal Best Parameters: ${JSON.stringify(bestInd)}`);
    let p = 0; for(const c of cases) if(JSON.stringify(simCliffGlobal(c.input, bestInd))===JSON.stringify(c.expected)) p++;
    console.log(`Final Global Match: ${p}/100`);
}
solve();
