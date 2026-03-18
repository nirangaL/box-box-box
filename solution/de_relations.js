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
const cases = loadTestCases();

function simulateRel(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        // Ensure grid gap
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*0.01, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30; 
    
    // ENFORCED RELATIONS
    // p[0] = offset_S, p[1] = offset_gap (so M = offset_S + gap, H = offset_S + 2*gap)
    // p[2] = tempCoeff (shared for all)
    // p[3] = degr1_H, M = 2*H, S = 4*H
    // p[4] = degr2_H, M = 2.5*H?, S = 5*H?  Let's do independent degr2_H, degr2_M, degr2_S for now or just generic multipliers
    // p[5] = shelf_S, M = 2*S, H = 3*S
    // p[6] = pitExit
    // p[7] = qPen
    // p[8], p[9], p[10] = freshBonus
    
    const off = [p[0], p[0] + p[1], p[0] + 2*p[1]];
    const tc = [p[2], p[2], p[2]];
    const d1 = [p[3]*4, p[3]*2, p[3]];
    const d2 = [p[4]*4, p[4]*2, p[4]]; // assume matching ratios
    const shelf = [p[5], p[5]*2, p[5]*3];
    const fb = [p[8], p[9], p[10]];

    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - shelf[ti]);
            
            const wearEffect = (d1[ti] * wearAge + d2[ti] * wearAge * wearAge) * (1 + tc[ti] * tDelta);
            c.time += base * (1 + off[ti] + wearEffect) + (c.age === 1 ? fb[ti] : 0) + (c.si > 0 && c.age === 1 ? p[6] : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p[7];
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

function getPairScore(p) {
    let match = 0, pairs = 0;
    for (const c of cases) {
        const pred = simulateRel(c.input, p);
        for(let i=0; i<20; i++) {
            if(pred[i] === c.expected[i]) match++;
            for(let j=i+1; j<20; j++) if(c.em[pred[i]] < c.em[pred[j]]) pairs++;
        }
    }
    return match * 1000 + pairs;
}

let pop = Array.from({length: 40}, () => [
    -0.1 + Math.random()*0.1, // 0: off_S
    0.005 + Math.random()*0.02, // 1: off_gap
    0.01 + Math.random()*0.02, // 2: tempCoeff
    0.001 + Math.random()*0.01, // 3: degr1_H
    0.00001 + Math.random()*0.0001, // 4: degr2_H
    8 + Math.random()*4, // 5: shelf_S
    -3 + Math.random()*6, // 6: pitExit
    0.5, // 7: qPen
    -2 + Math.random()*2, // 8: fb_S
    -2 + Math.random()*2, // 9: fb_M
    -2 + Math.random()*2  // 10: fb_H
]);

// Seed with best known baseline relation
pop[0] = [-0.0575, 0.010, 0.02, 0.004, 0.000025, 10, -2, 0.5, -0.75, -1.0, -2.0];

async function solve() {
    console.log('Solving Structured Global DE...');
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
                    for (const c of cases) if (JSON.stringify(simulateRel(c.input, mutant)) === JSON.stringify(c.expected)) passes++;
                    console.log(`Gen ${gen}: Best Score ${best} | Passes ${passes}/100`);
                }
            }
        }
    }
    let bestInd = pop[0], bestS = 0;
    pop.forEach(p => { const s = getPairScore(p); if(s>bestS) { bestS=s; bestInd=p; }});
    console.log(`\nFinal Best Parameters: ${JSON.stringify(bestInd)}`);
    let passes = 0; for(const c of cases) if(JSON.stringify(simulateRel(c.input, bestInd))===JSON.stringify(c.expected)) passes++;
    console.log(`Final Global Match: ${passes}/100`);
}
solve();
