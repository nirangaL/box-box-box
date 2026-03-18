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

function simulate(race, p) {
    const rc = race.race_config;
    const base = rc.base_lap_time;
    const temp = rc.track_temp;
    const pit = rc.pit_lane_time;
    const total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*0.01, stops: s.pit_stops || [], si: 0 });
    }
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 'SOFT' : c.tire[0] === 'M' ? 'MEDIUM' : 'HARD';
            const wearAge = Math.max(0, c.age - p.shelfLife[ti]);
            const wearEffect = (p.degr1[ti] * wearAge + p.degr2[ti] * wearAge * wearAge) * (1 + p.tempCoeff[ti]*(temp-30));
            c.time += base * (1 + p.offset[ti] + wearEffect) + (c.age === 1 ? p.freshBonus[ti] : 0) + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
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

function getScore(p) {
    let ok = 0;
    for (const c of cases) {
        const pred = simulate(c.input, p);
        if (JSON.stringify(pred) === JSON.stringify(c.expected)) ok++;
    }
    return ok;
}

// THE HYPOTHESIS: Standard Integer/Simple values for some parameters
const p = {
    offset: { SOFT: -0.05, MEDIUM: -0.03, HARD: -0.01 },
    tempCoeff: { SOFT: 0.02, MEDIUM: 0.02, HARD: 0.02 },
    degr1: { SOFT: 0.015, MEDIUM: 0.008, HARD: 0.004 },
    degr2: { SOFT: 0.0001, MEDIUM: 0.00005, HARD: 0.00002 },
    freshBonus: { SOFT: -0.5, MEDIUM: -0.5, HARD: -0.5 },
    pitExitPenalty: 0.2,
    shelfLife: { SOFT: 10, MEDIUM: 20, HARD: 30 },
    queuePenalty: 0.5
};

console.log(`Initial Clean Score: ${getScore(p)}/100`);

// Hill climb on the clean baseline
async function main() {
    let currentBest = p;
    let bestScore = getScore(p);

    for (let i = 0; i < 20000; i++) {
        const next = JSON.parse(JSON.stringify(currentBest));
        // Randomly tweak one param
        const groups = ['offset', 'tempCoeff', 'degr1', 'degr2', 'freshBonus', 'shelfLife', 'pitExitPenalty', 'queuePenalty'];
        const group = groups[Math.floor(Math.random() * groups.length)];
        
        if (typeof next[group] === 'object') {
            const tires = ['SOFT', 'MEDIUM', 'HARD'];
            const tire = tires[Math.floor(Math.random() * 3)];
            next[group][tire] += (Math.random() - 0.5) * 0.001;
            if (group === 'shelfLife') next[group][tire] = Math.max(0, next[group][tire]);
        } else {
            next[group] += (Math.random() - 0.5) * 0.01;
        }

        const score = getScore(next);
        if (score >= bestScore) {
            bestScore = score;
            currentBest = next;
            if (i % 100 === 0) console.log(`Step ${i}: ${bestScore}/100`);
            if (bestScore >= 90) break;
        }
    }
    
    fs.writeFileSync('solution/learned_params.json', JSON.stringify({ params: currentBest, score: bestScore }, null, 2));
}

main();
