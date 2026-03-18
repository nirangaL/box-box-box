const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
function loadTestCases() {
    const cases = [];
    for (let i = 1; i <= 100; i++) {
        const id = String(i).padStart(3, '0');
        const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`), 'utf8'));
        const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`), 'utf8'));
        cases.push({ input, expected: output.finishing_positions, em: output.finishing_positions.reduce((acc,id,rank)=>{acc[id]=rank;return acc;},{}) });
    }
    return cases;
}

function simulate(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    const shelf = [10, 20, 30]; // Fixed theory
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - shelf[ti]);
            const wearEffect = (p[6+ti]*wearAge + p[9+ti]*wearAge*wearAge) * (1 + p[3+ti]*tDelta);
            c.time += base * (1 + p[ti] + wearEffect) + (c.age === 1 ? p[12+ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time-b.time) || (a.grid-b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p[19];
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time-b.time) || (a.grid-b.grid)).map(x=>x.id);
}

function score(cases, p) {
    let exact = 0, pairs = 0;
    for (const c of cases) {
        const pred = simulate(c.input, p);
        if (JSON.stringify(pred) === JSON.stringify(c.expected)) { exact++; pairs += 190; }
        else { for(let i=0;i<20;i++){ const ri=c.em[pred[i]]; for(let j=i+1;j<20;j++) if(ri<c.em[pred[j]]) pairs++; } }
    }
    return exact * 1000000 + pairs;
}

const RANGES = [
    [-0.1, 0.1], [-0.1, 0.1], [-0.1, 0.1], // off
    [0, 0.1], [0, 0.1], [0, 0.1], // tCoeff
    [0, 0.05], [0, 0.05], [0, 0.05], // d1
    [0, 0.005], [0, 0.005], [0, 0.005], // d2
    [-2, 2], [-2, 2], [-2, 2], // fresh
    [-2, 2], // exit
    [0, 0, 0], // placeholders for shelf
    [0, 1.0] // qPen
];

async function main() {
    const cases = loadTestCases();
    const p = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;
    let current = [p.offset.SOFT, p.offset.MEDIUM, p.offset.HARD, p.tempCoeff.SOFT, p.tempCoeff.MEDIUM, p.tempCoeff.HARD,
                   p.degr1.SOFT, p.degr1.MEDIUM, p.degr1.HARD, p.degr2.SOFT, p.degr2.MEDIUM, p.degr2.HARD,
                   p.freshBonus.SOFT, p.freshBonus.MEDIUM, p.freshBonus.HARD, p.pitExitPenalty,
                   0, 0, 0, p.queuePenalty || 0];
    
    let bestScore = score(cases, current);
    console.log(`Initial Score with Fixed Shelf [10,20,30]: ${Math.floor(bestScore/1000000)}/100`);
    
    // Tiny random search / Hill Climbing
    for(let i=0; i<10000; i++) {
        const next = current.map((v, idx) => {
            if(idx === 16 || idx === 17 || idx === 18) return 0;
            return v + (Math.random()-0.5) * 0.001 * (RANGES[idx][1]-RANGES[idx][0]);
        });
        const s = score(cases, next);
        if(s >= bestScore) {
            bestScore = s; current = next;
            if(i % 100 === 0) console.log(`Step ${i} Best: ${Math.floor(s/1000000)}/100`);
        }
    }
}
main();
