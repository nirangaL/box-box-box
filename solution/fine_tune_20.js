const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');
function simulate(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let j = 1; j <= 20; j++) {
        const sj = race.strategies[`pos${j}`];
        cars.push({ id: sj.driver_id, grid: j, tire: sj.starting_tire, age: 0, time: 0, stops: sj.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire.toUpperCase();
            const wear = (p.degr1[ti]*Math.max(0, c.age-p.shelfLife[ti]) + p.degr2[ti]*Math.pow(Math.max(0, c.age-p.shelfLife[ti]),2)) * (1 + p.tempCoeff[ti]*tDelta);
            c.time += base*(1+p.offset[ti]+wear)+(c.age===1?p.freshBonus[ti]:0)+(c.si>0&&c.age===1?p.pitExitPenalty : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => { c.time += pit + q*p.queuePenalty; c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++; });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

const cases = [];
for (let i = 1; i <= 20; i++) { // First 20
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`)));
    const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`)));
    cases.push({ input, exp: output.finishing_positions });
}

const sl = JSON.parse(fs.readFileSync('solution/learned_params.json')).params;
const original = JSON.parse(JSON.stringify(sl));

async function fineTune() {
    let bestP = JSON.parse(JSON.stringify(original));
    let bestScore = 0;
    for (let i=1; i<=20; i++) {
        const id = String(i).padStart(3, '0');
        if (JSON.stringify(simulate(cases[i-1].input, bestP)) === JSON.stringify(cases[i-1].exp)) bestScore++;
    }
    console.log(`Initial Score for 001-020: ${bestScore}/20`);
    
    for (let loop = 0; loop < 2000; loop++) {
        let p = JSON.parse(JSON.stringify(bestP));
        // Small mutation
        const key = ['offset', 'degr1', 'shelfLife'][Math.floor(Math.random()*3)];
        const ti = ['SOFT', 'MEDIUM', 'HARD'][Math.floor(Math.random()*3)];
        p[key][ti] += (Math.random()-0.5) * 0.001 * (key === 'shelfLife' ? 10 : 1);
        
        let s = 0;
        for (const c of cases) {
            if (JSON.stringify(simulate(c.input, p)) === JSON.stringify(c.exp)) s++;
        }
        if (s >= bestScore) {
            bestScore = s; bestP = p;
            if (s > bestScore - 1) console.log(`Loop ${loop}: ${s}/20 (OffsetH=${p.offset.HARD.toFixed(5)} ShelvH=${p.shelfLife.HARD.toFixed(2)})`);
        }
    }
}
fineTune();
