const fs = require('fs');
const { simulate } = require('./race_simulator.js');

const s = JSON.parse(fs.readFileSync('solution/learned_params.json')).params;
const original = JSON.parse(JSON.stringify(s));

for (let qp of [0, 0.1, 0.2, 0.3, 0.4, 0.5]) {
    const p = JSON.parse(JSON.stringify(original));
    p.queuePenalty = qp;
    fs.writeFileSync('solution/learned_params.json', JSON.stringify({params: p}, null, 2));
    
    // Clear require cache for race_simulator or use a separate sim
    // Actually simpler to just write a sim here
    function simLocal(race, p) {
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
                const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
                const wearAge = Math.max(0, c.age - p.shelfLife[c.tire.toUpperCase()]);
                const wearEffect = (p.degr1[c.tire.toUpperCase()]*wearAge + p.degr2[c.tire.toUpperCase()]*wearAge*wearAge) * (1 + p.tempCoeff[c.tire.toUpperCase()]*tDelta);
                c.time += base * (1 + p.offset[c.tire.toUpperCase()] + wearEffect) + (c.age === 1 ? p.freshBonus[c.tire.toUpperCase()] : 0) + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
            }
            let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
            pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
            pitting.forEach((c, q) => {
                c.time += pit + q * p.queuePenalty;
                c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
            });
        }
        return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
    }

    let passed = 0, totalPairs = 0;
    for (let i = 1; i <= 100; i++) {
        const id = String(i).padStart(3, '0');
        const input = JSON.parse(fs.readFileSync(`data/test_cases/inputs/test_${id}.json`));
        const output = JSON.parse(fs.readFileSync(`data/test_cases/expected_outputs/test_${id}.json`));
        const res = simLocal(input, p);
        const exp = output.finishing_positions;
        const expMap = exp.reduce((acc, id, r) => { acc[id] = r; return acc; }, {});
        if (JSON.stringify(res) === JSON.stringify(exp)) { passed++; totalPairs += 190; }
        else {
            for (let j = 0; j < 20; j++) {
                const rj = expMap[res[j]];
                for (let k = j + 1; k < 20; k++) if (rj < expMap[res[k]]) totalPairs++;
            }
        }
    }
    console.log(`qp=${qp}: Pass=${passed}/100 Pairs=${totalPairs}`);
}
// Restore
fs.writeFileSync('solution/learned_params.json', JSON.stringify({params: original}, null, 2));
