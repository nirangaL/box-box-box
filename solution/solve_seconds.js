const fs = require('fs');
const path = require('path');

const t = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_001.json', 'utf8'));
const exp = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_001.json', 'utf8')).finishing_positions;
const strats = t.strategies;

const d = [];
for (let i = 1; i <= 20; i++) d.push({ id: strats[`pos${i}`].driver_id, grid: i, starting_tire: strats[`pos${i}`].starting_tire, pit_lap: strats[`pos${i}`].pit_stops[0].lap, to_tire: strats[`pos${i}`].pit_stops[0].to_tire, rank: exp.indexOf(strats[`pos${i}`].driver_id) + 1 });

d.sort((a,b) => a.rank - b.rank);

// Let's implement EXACT 1-second truncation math to see if there is large rounding error
function simulateS(sPace, sDegradation) {
    const rc = t.race_config, base = rc.base_lap_time, pit = rc.pit_lane_time, total = rc.total_laps;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = t.strategies[`pos${i}`];
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops || [], si: 0 }); // Intentionally starting at 0 to test pure integer sort
    }
    
    for (let lap = 1; lap <= total; lap++) {
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 0 : c.tire[0] === 'M' ? 1 : 2;
            
            // INTENTIONALLY BAD GAME DEV MATH: Convert entirely to integers.
            const lapTime = Math.floor(base) + sPace[ti] + c.age * sDegradation[ti];
            c.time += lapTime;
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += Math.floor(pit);
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    // Final tie breaker is ALWAYS grid position
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

const res = simulateS([-3, -2, -1], [1, 0, 0]); // Test 1s wear etc
let score = 0;
for(let i=0; i<20; i++) if(res[i] === exp[i]) score++;
console.log(`Int Seconds Score: ${score}/20`);
