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

// Analytical Time Calculation
function calcAnalytical(race, p) {
    const rc = race.race_config;
    const base = rc.base_lap_time;
    const total = rc.total_laps;
    const temp = rc.track_temp;
    const pitCost = rc.pit_lane_time;
    
    // parameters layout:
    // p[0..2] = offset (S, M, H)
    // p[3..5] = degr (S, M, H)
    // p[6..8] = tempCoeff (S, M, H)  -> Temp affects Base offset
    // p[9..11] = tempDegr (S, M, H) -> Temp affects Wear rate
    // p[12..14] = freshBonus (S, M, H) -> Bonus on lap 1
    // p[15] = grid gap multiplier
    // p[16] = pit exit queue penalty
    
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        let totalTime = 0;
        let pitCount = 0;
        let lastLap = 0;
        let tire = s.starting_tire;
        
        const stops = s.pit_stops || [];
        const tDelta = temp - 30; // standard deviation origin
        
        for (const stop of stops) {
            const stintLaps = stop.lap - lastLap;
            const ti = tire[0] === 'S' ? 0 : tire[0] === 'M' ? 1 : 2;
            
            const off = p[ti] + p[6 + ti] * tDelta;
            const deg = p[3 + ti] + p[9 + ti] * tDelta;
            const fresh = p[12 + ti];
            
            // Sum(lapTime)
            // lapTime = base * (1 + off + deg*age)
            const sumLaps = stintLaps * base * (1 + off) + base * deg * (stintLaps * (stintLaps + 1) / 2) + fresh;
            totalTime += sumLaps;
            
            lastLap = stop.lap;
            tire = stop.to_tire;
            pitCount++;
        }
        
        const finalStint = total - lastLap;
        if (finalStint > 0) {
            const ti = tire[0] === 'S' ? 0 : tire[0] === 'M' ? 1 : 2;
            const off = p[ti] + p[6 + ti] * tDelta;
            const deg = p[3 + ti] + p[9 + ti] * tDelta;
            const fresh = p[12 + ti];
            
            const sumLaps = finalStint * base * (1 + off) + base * deg * (finalStint * (finalStint + 1) / 2) + fresh;
            totalTime += sumLaps;
        }
        
        totalTime += pitCount * pitCost;
        totalTime += (i-1) * p[15]; // Grid Gap
        
        cars.push({ id: s.driver_id, grid: i, time: totalTime, stops: pitCount });
    }
    
    // Sort logic
    cars.sort((a,b) => {
        if (Math.abs(a.time - b.time) < 1e-9) return a.grid - b.grid;
        return a.time - b.time;
    });
    
    // Apply Queue Penalty Post-hoc? Very hard analytically if overlapping pit laps.
    // Ignored for analytical approximation.
    
    return cars.map(x => x.id);
}

function getPairScore(p) {
    let match = 0, pairs = 0;
    for (const c of cases) {
        const pred = calcAnalytical(c.input, p);
        for(let i=0; i<20; i++) {
            if(pred[i] === c.expected[i]) match++;
            for(let j=i+1; j<20; j++) if(c.em[pred[i]] < c.em[pred[j]]) pairs++;
        }
    }
    return match * 1000 + pairs; // Heavily weight exact matches
}

// Genetic search
let pop = Array.from({length: 100}, () => [
    -0.05 + Math.random()*0.05, -0.05 + Math.random()*0.05, -0.05 + Math.random()*0.05, // off
    0.0 + Math.random()*0.01, 0.0 + Math.random()*0.01, 0.0 + Math.random()*0.01, // deg
    0.0 + Math.random()*0.01, 0.0 + Math.random()*0.01, 0.0 + Math.random()*0.01, // tempCoeff off
    0.0, 0.0, 0.0, // tempCoeff deg
    -1.0 + Math.random()*1, -1.0 + Math.random()*1, -1.0 + Math.random()*1, // fresh Bonus
    0.01 + Math.random()*0.05, // grid gap
    0 // queue penalty (analytic ignores it)
]);

async function solve() {
    console.log('Solving Analytical Polynomial DE...');
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
                    for (const c of cases) if (JSON.stringify(calcAnalytical(c.input, mutant)) === JSON.stringify(c.expected)) passes++;
                    console.log(`Gen ${gen}: Best Score ${best} | Passes ${passes}/100`);
                }
            }
        }
    }
    let bestInd = pop[0]; let bs = 0;
    pop.forEach(p=>{const s=getPairScore(p); if(s>bs){bs=s;bestInd=p;}});
    console.log(`Final Ind: [${bestInd.join(', ')}]`);
}
solve();
