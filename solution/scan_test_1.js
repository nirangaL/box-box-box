const fs = require('fs');
const path = require('path');

const input = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_001.json', 'utf8'));
const expected = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_001.json', 'utf8')).finishing_positions;
const params = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

function get(group, tire, p) {
  if (group === 'queuePenalty') return p;
  if (params[group] && params[group][tire] !== undefined) return params[group][tire];
  if (params[group] !== undefined && typeof params[group] !== 'object') return params[group];
  return 0;
}

function simulate(p) {
  const rc = input.race_config;
  const base = rc.base_lap_time, temp = rc.track_temp, pit = rc.pit_lane_time, laps = rc.total_laps;
  const cars = [];
  for (let i=1; i<=20; i++) {
    const s = input.strategies[`pos${i}`];
    cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: 0, stops: s.pit_stops, si: 0 });
  }
  for (let lap=1; lap<=laps; lap++) {
    for (const c of cars) {
      c.age++;
      const tire = c.tire;
      const shelf = Math.round(get('shelfLife', tire, p));
      const wear = Math.max(0, c.age - shelf);
      const wearEffect = (get('degr1', tire, p)*wear + get('degr2', tire, p)*wear*wear)*(1 + get('tempCoeff', tire, p)*(temp-30));
      c.time += base*(1 + get('offset', tire, p) + wearEffect) + (c.age===1?get('freshBonus', tire, p):0) + (c.si>0&&c.age===1?get('pitExitPenalty', tire, p):0);
    }
    let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
    pitting.sort((a,b) => (a.time-b.time) || (a.grid-b.grid));
    pitting.forEach((c, q) => {
      c.time += pit + q * p;
      c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
    });
  }
  return cars.sort((a,b) => (a.time-b.time) || (a.grid-b.grid)).map(x=>x.id);
}

for (let q=0; q<=2.0; q+=0.01) {
  const pred = simulate(q);
  if (JSON.stringify(pred) === JSON.stringify(expected)) {
    console.log(`PASS TEST_001 at qPen = ${q.toFixed(2)}`);
  }
}
