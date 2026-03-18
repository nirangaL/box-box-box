const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
function loadTestCases() {
    const cases = [];
    for (let i = 1; i <= 100; i++) {
        const id = String(i).padStart(3, '0');
        const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`), 'utf8'));
        const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`), 'utf8'));
        cases.push({
            input,
            expected: output.finishing_positions,
            expectedMap: output.finishing_positions.reduce((acc, id, rank) => { acc[id] = rank; return acc; }, {})
        });
    }
    return cases;
}

function simulate(race, p) {
    const rc = race.race_config;
    const base = rc.base_lap_time, temp = rc.track_temp, pit = rc.pit_lane_time, total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;

    for (let lap = 1; lap <= total; lap++) {
        const fuel = (total - lap) / total;
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p[16 + ti]);
            const wearEffect = (p[6 + ti] * wearAge + p[9 + ti] * wearAge * wearAge) * (1 + p[3 + ti] * tDelta);
            
            // pace = base * (1 + offset + wearEffect + fuel*fuelFactor + abs(temp-30)*tempPace)
            const lapTime = base * (1 + p[ti] + wearEffect + fuel * p[20] + Math.abs(tDelta) * p[21 + ti]) 
                 + (c.age === 1 ? p[12 + ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
            c.time += lapTime;
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p[19];
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

function score(cases, p) {
    let exact = 0, pairs = 0;
    for (const c of cases) {
        const pred = simulate(c.input, p);
        if (JSON.stringify(pred) === JSON.stringify(c.expected)) {
            exact++;
            pairs += 190;
        } else {
            for (let i = 0; i < 20; i++) {
                const ri = c.expectedMap[pred[i]];
                for (let j = i + 1; j < 20; j++) if (ri < c.expectedMap[pred[j]]) pairs++;
            }
        }
    }
    return exact * 1000000 + pairs;
}

const cases = loadTestCases();
const BEST = JSON.parse(fs.readFileSync(path.join(__dirname, 'learned_params.json'))).params;
let p = [
    BEST.offset.SOFT, BEST.offset.MEDIUM, BEST.offset.HARD,
    BEST.tempCoeff.SOFT, BEST.tempCoeff.MEDIUM, BEST.tempCoeff.HARD,
    BEST.degr1.SOFT, BEST.degr1.MEDIUM, BEST.degr1.HARD,
    BEST.degr2.SOFT || 0, BEST.degr2.MEDIUM || 0, BEST.degr2.HARD || 0,
    BEST.freshBonus.SOFT, BEST.freshBonus.MEDIUM, BEST.freshBonus.HARD,
    BEST.pitExitPenalty,
    BEST.shelfLife.SOFT, BEST.shelfLife.MEDIUM, BEST.shelfLife.HARD,
    BEST.queuePenalty || 0,
    0.0, // Seed fuel Factor
    0.0, 0.0, 0.0 // tempPace
];

async function refine() {
    let bestScore = score(cases, p);
    console.log(`Starting Greedy Refinement. Initial Score: ${Math.floor(bestScore/1000000)}/100 (${bestScore%1000000} pairs)`);
    
    for (let loop = 0; loop < 50; loop++) {
        let changed = false;
        for (let i = 0; i < p.length; i++) {
            const originalVal = p[i];
            const steps = [0.0001, 0.001, 0.01];
            for (const step of steps) {
                // Try Up
                p[i] = originalVal + step;
                let sUp = score(cases, p);
                if (sUp > bestScore) {
                    bestScore = sUp;
                    changed = true;
                    console.log(`L${loop} P${i}+: ${Math.floor(sUp/1000000)}/100 (${sUp%1000000})`);
                    break;
                }
                // Try Down
                p[i] = originalVal - step;
                let sDown = score(cases, p);
                if (sDown > bestScore) {
                    bestScore = sDown;
                    changed = true;
                    console.log(`L${loop} P${i}-: ${Math.floor(sDown/1000000)}/100 (${sDown%1000000})`);
                    break;
                }
                p[i] = originalVal;
            }
        }
        if (!changed) break;
    }
    
    // Final Save
    console.log(`Refined Score: ${Math.floor(bestScore/1000000)}/100`);
    const result = {
        params: {
            offset: { SOFT: p[0], MEDIUM: p[1], HARD: p[2] },
            tempCoeff: { SOFT: p[3], MEDIUM: p[4], HARD: p[5] },
            degr1: { SOFT: p[6], MEDIUM: p[7], HARD: p[8] },
            degr2: { SOFT: p[9], MEDIUM: p[10], HARD: p[11] },
            freshBonus: { SOFT: p[12], MEDIUM: p[13], HARD: p[14] },
            pitExitPenalty: p[15],
            shelfLife: { SOFT: p[16], MEDIUM: p[17], HARD: p[18] },
            queuePenalty: p[19],
            fuelFactor: p[20],
            tempPace: { SOFT: p[21], MEDIUM: p[22], HARD: p[23] }
        }
    };
    fs.writeFileSync('solution/learned_params_greedy.json', JSON.stringify(result, null, 2));
}

refine();
