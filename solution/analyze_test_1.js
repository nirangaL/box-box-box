const fs = require('fs');
const path = require('path');

const id = '001';
const input = JSON.parse(fs.readFileSync(`data/test_cases/inputs/test_${id}.json`, 'utf8'));
const expected = JSON.parse(fs.readFileSync(`data/test_cases/expected_outputs/test_${id}.json`, 'utf8')).finishing_positions;

// We need to modify simulate to return times
const rc = input.race_config;
const base = rc.base_lap_time;
const temp = rc.track_temp;
const pit = rc.pit_lane_time;
const totalLaps = rc.total_laps;

const params = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

function get(group, tire, fallback) {
  if (params && params[group] && params[group][tire] !== undefined) return params[group][tire];
  if (params && params[group] !== undefined && typeof params[group] !== 'object') return params[group];
  return fallback;
}

const cars = [];
for (let i = 1; i <= 20; i++) {
  const stratKey = `pos${i}`;
  const strat = input.strategies[stratKey];
  cars.push({
    id: strat.driver_id,
    grid: i,
    tire: strat.starting_tire,
    age: 0,
    totalTime: 0,
    stops: (strat.pit_stops || []).slice().sort((a,b) => a.lap - b.lap),
    stopIdx: 0
  });
}

for (let lap = 1; lap <= totalLaps; lap++) {
  for (const car of cars) {
    car.age++;
    const tire = car.tire;
    const shelf = Math.round(get('shelfLife', tire, 0));
    const wearAge = Math.max(0, car.age - shelf);
    const wearEffect = (get('degr1', tire, 0) * wearAge + get('degr2', tire, 0) * wearAge * wearAge) * (1 + get('tempCoeff', tire, 0) * (temp - 30));
    
    const lapTime = base * (1 + get('offset', tire, 0) + wearEffect)
      + (car.age === 1 ? get('freshBonus', tire, 0) : 0)
      + (car.stopIdx > 0 && car.age === 1 ? get('pitExitPenalty', tire, 0) : 0);
    car.totalTime += lapTime;
  }
  let pitting = cars.filter(c => c.stopIdx < c.stops.length && c.stops[c.stopIdx].lap === lap);
  pitting.sort((a,b) => (a.totalTime - b.totalTime) || (a.grid - b.grid));
  pitting.forEach((car, q) => {
    car.totalTime += pit + q * 1.0;
    car.tire = car.stops[car.stopIdx].to_tire;
    car.age = 0;
    car.stopIdx++;
  });
}

console.log('Detailed Times for TEST_001');
const results = cars.sort((a,b) => (a.totalTime - b.totalTime) || (a.grid - b.grid));
results.forEach((c, i) => {
    const expRank = expected.indexOf(c.id) + 1;
    console.log(`${(i+1).toString().padStart(2)} | ${c.id} | Time: ${c.totalTime.toFixed(4)} | Exp Rank: ${expRank} | Diff: ${(c.totalTime - results[0].totalTime).toFixed(4)}`);
});
