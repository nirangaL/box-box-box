const fs = require('fs');
const path = require('path');

function sim(r, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = r.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = r.strategies['pos' + i];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        const fl = (total - lap) / total;
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            
            // HYPOTHESIS: Shelf life depends on fuel
            const shelf = p[16 + ti] * (1 - fl * p[20]); 
            const wearAge = Math.max(0, c.age - shelf);
            const wearEffect = (p[6 + ti] * wearAge + p[9 + ti] * wearAge * wearAge) * (1 + p[3 + ti] * tDelta);
            
            let lp = base * (1 + p[ti] + wearEffect) + (c.age === 1 ? p[12 + ti] : 0) + (c.si > 0 && c.age === 1 ? p[15] : 0);
            c.time += lp;
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p[19];
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
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
    0.5, // queue
    0.2 // shelf fuel coefficient p[20]
];

const input = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_014.json'));
const exp = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_014.json')).finishing_positions;
for (let ff of [0, 0.2, 0.5, 0.8]) {
    p[20] = ff;
    const res = sim(input, p);
    const pass = JSON.stringify(res) === JSON.stringify(exp);
    console.log(`shelfFuelFactor=${ff} P3=${res[2]} P4=${res[3]} | PASS? ${pass}`);
}
