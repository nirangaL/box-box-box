const fs = require('fs');
const path = require('path');

function simulate(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    
    for (let lap = 1; lap <= total; lap++) {
        const fuelLoad = (total - lap) / total; // 1.0 at start, 0.0 at end
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            const wearAge = Math.max(0, c.age - p[16 + ti]);
            const wearEffect = (p[6 + ti] * wearAge + p[9 + ti] * wearAge * wearAge) * (1 + p[3 + ti] * tDelta);
            
            // p[20] is fuelFactor
            let lapTime = base * (1 + p[ti] + wearEffect + fuelLoad * p[20]) + (c.age === 1 ? p[12 + ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
            
            c.time += lapTime;
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c) => {
            c.time += pit + p[19];
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x=>x.id);
}

const s = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;
const p = [
    s.offset.SOFT, s.offset.MEDIUM, s.offset.HARD,
    s.tempCoeff.SOFT, s.tempCoeff.MEDIUM, s.tempCoeff.HARD,
    s.degr1.SOFT, s.degr1.MEDIUM, s.degr1.HARD,
    s.degr2.SOFT, s.degr2.MEDIUM, s.degr2.HARD,
    s.freshBonus.SOFT, s.freshBonus.MEDIUM, s.freshBonus.HARD,
    s.pitExitPenalty,
    s.shelfLife.SOFT, s.shelfLife.MEDIUM, s.shelfLife.HARD,
    s.queuePenalty,
    0.005 // fuelFactor
];

const tests = ["014"]; 
for (const id of tests) {
    const input = JSON.parse(fs.readFileSync(`data/test_cases/inputs/test_${id}.json`));
    const expected = JSON.parse(fs.readFileSync(`data/test_cases/expected_outputs/test_${id}.json`)).finishing_positions;
    
    console.log(`\nTest ${id} (Temp=${input.race_config.track_temp}):`);
    for (const ff of [0, 0.005, 0.01, 0.02, 0.05]) {
        p[20] = ff;
        const res = simulate(input, p);
        const d017Pos = res.indexOf('D017')+1;
        const d002Pos = res.indexOf('D002')+1;
        console.log(`  fuelFactor=${ff.toFixed(3)}: D017 P${d017Pos}, D002 P${d002Pos} | ${res[2]==='D002' ? 'D002=P3!' : ''}`);
    }
}
