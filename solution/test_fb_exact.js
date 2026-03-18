const fs = require('fs');
const path = require('path');

const p = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

function simulate(id, fb) {
    const input = JSON.parse(fs.readFileSync(`data/test_cases/inputs/test_${id}.json`, 'utf8'));
    const expected = JSON.parse(fs.readFileSync(`data/test_cases/expected_outputs/test_${id}.json`, 'utf8')).finishing_positions;

    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = input.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = input.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 });
    }
    
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 'SOFT' : c.tire[0] === 'M' ? 'MEDIUM' : 'HARD';
            const wearAge = Math.max(0, c.age - p.shelfLife[ti]);
            const wearEffect = (p.degr1[ti] * wearAge) * (1 + p.tempCoeff[ti]*(temp-30));
            
            // Fuel Burn: faster every lap
            // If base is empty-car time, start with total fuel
            c.time += (base + fb * (total - lap)) * (1 + p.offset[ti] + wearEffect) 
                   + (c.age === 1 ? p.freshBonus[ti] : 0) 
                   + (c.si > 0 && c.age === 1 ? p.pitExitPenalty : 0);
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p.queuePenalty;
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    const pred = cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
    return JSON.stringify(pred) === JSON.stringify(expected);
}

// FB = 4.3 / 52 = 0.0827
console.log('Testing Silverstone with FB = 0.0827...');
console.log(`TEST_005: ${simulate('005', 0.0827)}`);
console.log(`TEST_006: ${simulate('006', 0.0827)}`);
