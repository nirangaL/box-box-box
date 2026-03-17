const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');

function loadTestCases() {
  const cases = [];
  for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`), 'utf8'));
    const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`), 'utf8'));
    cases.push({ input, expected: output.finishing_positions });
  }
  return cases;
}

const params = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;

function get(group, tire, fallback) {
  if (params && params[group] && params[group][tire] !== undefined) return params[group][tire];
  if (params && params[group] !== undefined && typeof params[group] !== 'object') return params[group];
  return fallback;
}

function simulate(race, qPen) {
  const rc = race.race_config;
  const base = rc.base_lap_time;
  const temp = rc.track_temp;
  const pit = rc.pit_lane_time;
  const totalLaps = rc.total_laps;

  const cars = [];
  for (let i = 1; i <= 20; i++) {
    const stratKey = `pos${i}`;
    const strat = race.strategies[stratKey];
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
      car.totalTime += base * (1 + get('offset', tire, 0) + wearEffect)
        + (car.age === 1 ? get('freshBonus', tire, 0) : 0)
        + (car.stopIdx > 0 && car.age === 1 ? get('pitExitPenalty', tire, 0) : 0);
    }
    let pitting = cars.filter(c => c.stopIdx < c.stops.length && c.stops[c.stopIdx].lap === lap);
    pitting.sort((a,b) => (a.totalTime - b.totalTime) || (a.grid - b.grid));
    pitting.forEach((car, q) => {
      car.totalTime += pit + q * qPen;
      car.tire = car.stops[car.stopIdx].to_tire;
      car.age = 0;
      car.stopIdx++;
    });
  }
  return cars.sort((a,b) => (a.totalTime - b.totalTime) || (a.grid - b.grid)).map(x=>x.id);
}

const cases = loadTestCases();
console.log('Scanning Queue Penalty...');
for (let q = 0; q <= 2.0; q += 0.05) {
    let ok = 0;
    for (const c of cases) {
        if (JSON.stringify(simulate(c.input, q)) === JSON.stringify(c.expected)) ok++;
    }
    console.log(`Q-Pen ${q.toFixed(2)}: ${ok}/100`);
}
