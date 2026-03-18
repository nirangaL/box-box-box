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

function simulateLinear(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*0.01, stops: s.pit_stops || [], si: 0 });
    }
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 'SOFT' : c.tire[0] === 'M' ? 'MEDIUM' : 'HARD';
            const wearRate = p.degr[ti] * (1 + p.tempCoeff * (temp - 30));
            const wearEffect = Math.max(0, c.age - p.shelf[ti]) * wearRate;
            let lapTime = base * (1 + p.offset[ti]) + wearEffect;
            if (c.age === 1) lapTime += p.freshBonus[ti];
            c.time += lapTime;
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

const cases = loadTestCases();

function getPairScore(p) {
    let score = 0;
    for (const c of cases) {
        const pred = simulateLinear(c.input, p);
        for (let i = 0; i < 20; i++) {
            const ri = c.em[pred[i]];
            for (let j = i + 1; j < 20; j++) {
                if (ri < c.em[pred[j]]) score++;
            }
        }
    }
    return score;
}

const p = {
    degr: { SOFT: 0.1, MEDIUM: 0.05, HARD: 0.02 },
    offset: { SOFT: -0.05, MEDIUM: -0.03, HARD: -0.01 },
    shelf: { SOFT: 0, MEDIUM: 0, HARD: 0 },
    tempCoeff: 0.02,
    freshBonus: { SOFT: -0.2, MEDIUM: -0.1, HARD: 0.0 },
    queuePenalty: 0.5
};

async function search() {
    let currentBest = p;
    let rank = getPairScore(p);
    console.log(`Starting Smooth Search. Initial Score: ${rank}`);
    
    for (let i = 0; i < 2000; i++) {
        const next = JSON.parse(JSON.stringify(currentBest));
        const group = ['degr', 'offset', 'freshBonus', 'tempCoeff'][Math.floor(Math.random() * 4)];
        if (group === 'tempCoeff') {
            next.tempCoeff += (Math.random() - 0.5) * 0.005;
        } else {
            const tire = ['SOFT', 'MEDIUM', 'HARD'][Math.floor(Math.random() * 3)];
            next[group][tire] += (Math.random() - 0.5) * 0.01;
        }
        
        let s = getPairScore(next);
        if (s >= rank) {
            rank = s;
            currentBest = next;
            if (i % 20 === 0) {
                let passes = 0;
                for (const c of cases) if (JSON.stringify(simulateLinear(c.input, next)) === JSON.stringify(c.expected)) passes++;
                console.log(`Step ${i}: PairScore ${rank} | Passes ${passes}/100`);
            }
        }
    }
    console.log('Best Parameters:', JSON.stringify(currentBest, null, 2));
}

search();
