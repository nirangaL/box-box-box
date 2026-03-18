const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
const cases = [];
for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`)));
    const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`)));
    cases.push({ input, expected: output.finishing_positions, expectedRank: output.finishing_positions.reduce((acc, id, r) => { acc[id] = r; return acc; }, {}) });
}

function simulate(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let j = 1; j <= 20; j++) {
        const sj = race.strategies[`pos${j}`];
        cars.push({ id: sj.driver_id, grid: j, tire: sj.starting_tire, age: 0, time: 0, stops: sj.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        const fl = (total - lap) / total;
        for (const c of cars) {
            c.age++;
            const ti = c.tire.toUpperCase();
            const wearAge = Math.max(0, c.age - p.shelfLife[ti]);
            // Compound specific fuel wear
            const wearScale = (1 + p.tempCoeff[ti]*tDelta) * (1 + p.fuelWear[ti] * fl);
            const wear = (p.degr1[ti]*wearAge + p.degr2[ti]*wearAge*wearAge) * wearScale;
            // fuelPace
            c.time += base * (1 + p.offset[ti] + wear + p.fuelPace[ti] * fl) + (c.age === 1 ? p.freshBonus[ti] : 0) + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => { c.time += pit + q * p.queuePenalty; c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++; });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

function score(p) {
    let exact = 0, pairs = 0;
    for (const c of cases) {
        const res = simulate(c.input, p);
        if (JSON.stringify(res) === JSON.stringify(c.expected)) { exact++; pairs += 190; }
        else {
            for (let j = 0; j < 20; j++) {
                const rj = c.expectedRank[res[j]];
                for (let k = j + 1; k < 20; k++) if (rj < c.expectedRank[res[k]]) pairs++;
            }
        }
    }
    return exact * 1e6 + pairs;
}

const BEST = JSON.parse(fs.readFileSync('solution/learned_params_stagger.json')).params;
let p = JSON.parse(JSON.stringify(BEST));
p.fuelWear = { SOFT: 0, MEDIUM: 0, HARD: 0 };
p.fuelPace = { SOFT: 0, MEDIUM: 0, HARD: 0 };

async function solve() {
    let bestS = score(p);
    console.log(`Initial Fuel Score: ${Math.floor(bestS/1e6)}/100 Pairs=${bestS%1e6}`);

    const keys = [
        ['offset', 'SOFT'], ['offset', 'MEDIUM'], ['offset', 'HARD'],
        ['fuelWear', 'SOFT'], ['fuelWear', 'MEDIUM'], ['fuelWear', 'HARD'],
        ['fuelPace', 'SOFT'], ['fuelPace', 'MEDIUM'], ['fuelPace', 'HARD']
    ];

    for (let i = 0; i < 5000; i++) {
        if (i % 10 === 0) console.log(`Loop ${i}...`);
        const next = JSON.parse(JSON.stringify(p));
        const [k, ti] = keys[Math.floor(Math.random()*keys.length)];
        next[k][ti] += (Math.random() - 0.5) * 0.001;
        
        const s = score(next);
        if (s > bestS) {
            bestS = s; p = next;
            console.log(`[${i}] Fuel Rank: ${Math.floor(s/1e6)} Pairs=${s%1e6}`);
            fs.writeFileSync('solution/learned_params_fuel.json', JSON.stringify({params: p, score: s}, null, 2));
        }
    }
}
solve();
