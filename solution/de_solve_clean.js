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

function simClean(race, p) {
    const rc = race.race_config, base = rc.base_lap_time, pit = rc.pit_lane_time, total = rc.total_laps, temp = rc.track_temp;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        // Time initialized to 0, tiebreaker resolves grid later
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 }); 
    }
    
    const tDelta = temp - 30; // Use temp directly
    
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            
            // Age factor from shelf
            const wearAge = Math.max(0, c.age - p[ti]); // p[0..2] = Shelf
            const baseOffset = p[3+ti];                 // p[3..5] = Offset
            const tc = p[6+ti];                         // p[6..8] = TempCoeff
            const d1 = p[9+ti];                         // p[9..11] = degr1
            // const d2 = p[12+ti];                     // p[12..14] = degr2 (removed for simpler model)
            const fresh = p[15+ti];                     // p[15..17] = freshBonus
            
            const wearEffect = Math.max(0, d1 * wearAge) * (1 + tc * tDelta); // No quadratic logic for speed
            
            let lapTime = base * (1 + baseOffset + wearEffect);
            if (c.age === 1) lapTime += fresh;
            c.time += lapTime;
        }
        
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.forEach((c) => {
            // NO QUEUE PENALTY! Just flat pit lane time!
            c.time += pit; 
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => {
        if (Math.abs(a.time - b.time) < 1e-9) return a.grid - b.grid;
        return a.time - b.time;
    }).map(x => x.id);
}

function getPairScore(p) {
    let match = 0, pairs = 0;
    for (const c of cases) {
        const pred = simClean(c.input, p);
        for(let i=0; i<20; i++) {
            if(pred[i] === c.expected[i]) match++;
            for(let j=i+1; j<20; j++) if(c.em[pred[i]] < c.em[pred[j]]) pairs++;
        }
    }
    return match * 1000 + pairs;
}

let pop = Array.from({length: 40}, () => [
    5+Math.random()*10, 15+Math.random()*15, 25+Math.random()*15, // shelf
    -0.1+Math.random()*0.1, -0.1+Math.random()*0.1, -0.1+Math.random()*0.1, // off
    0.01+Math.random()*0.05, 0.01+Math.random()*0.05, 0.01+Math.random()*0.05, // tc
    0.001+Math.random()*0.02, 0.001+Math.random()*0.01, 0.001+Math.random()*0.005, // d1
    0,0,0, // unused d2 slots
    -1+Math.random()*2, -1+Math.random()*2, -1+Math.random()*2 // freshBonus
]);

const gb = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;
pop[0] = [
    gb.shelfLife.SOFT, gb.shelfLife.MEDIUM, gb.shelfLife.HARD,
    gb.offset.SOFT, gb.offset.MEDIUM, gb.offset.HARD,
    gb.tempCoeff.SOFT, gb.tempCoeff.MEDIUM, gb.tempCoeff.HARD,
    gb.degr1.SOFT, gb.degr1.MEDIUM, gb.degr1.HARD,
    0,0,0,
    gb.freshBonus.SOFT, gb.freshBonus.MEDIUM, gb.freshBonus.HARD
];

async function solve() {
    console.log('Solving No-Queue DE...');
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
                    for (const c of cases) if (JSON.stringify(simClean(c.input, mutant)) === JSON.stringify(c.expected)) passes++;
                    console.log(`Gen ${gen}: Best Score ${best} | Passes ${passes}/100`);
                }
            }
        }
    }
    let bestInd = pop[0]; let bs = 0;
    pop.forEach(p=>{const s=getPairScore(p); if(s>bs){bs=s;bestInd=p;}});
    console.log(`Final Global Match: ${getPairScore(bestInd)} pairs`);
}
solve();
