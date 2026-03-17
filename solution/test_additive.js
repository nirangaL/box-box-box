const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');

function loadTestCases() {
  const cases = [];
  for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`), 'utf8'));
    const output = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`), 'utf8'));
    cases.push({ 
        input, 
        expected: output.finishing_positions,
        expectedMap: output.finishing_positions.reduce((acc, id, rank) => { acc[id] = rank; return acc; }, {})
    });
  }
  return cases;
}

function simulateAdditive(race, p) {
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
      stops: (strat.pit_stops || []),
      stopIdx: 0
    });
  }

  for (let lap = 1; lap <= totalLaps; lap++) {
    for (let i = 0; i < 20; i++) {
      const car = cars[i];
      car.age++;
      const ti = car.tire[0] === 'S' ? 0 : car.tire[0] === 'M' ? 1 : 2;
      const shelf = Math.round(p[16+ti]);
      const wearAge = Math.max(0, car.age - shelf);
      // ADDITIVE MODEL
      const wearEffect = (p[6+ti] * wearAge + p[9+ti] * wearAge * wearAge) * (1 + p[3+ti] * (temp - 30));
      
      car.totalTime += base + p[ti] + wearEffect
        + (car.age === 1 ? p[12+ti] : 0)
        + (car.stopIdx > 0 && car.age === 1 ? p[15] : 0);
    }

    let pittingIndices = [];
    for (let i = 0; i < 20; i++) {
      const car = cars[i];
      if (car.stopIdx < car.stops.length && car.stops[car.stopIdx].lap === lap) pittingIndices.push(i);
    }

    if (pittingIndices.length > 0) {
      pittingIndices.sort((a,b) => (cars[a].totalTime - cars[b].totalTime) || (cars[a].grid - cars[b].grid));
      for (let q = 0; q < pittingIndices.length; q++) {
        const car = cars[pittingIndices[q]];
        car.totalTime += pit + q * p[19];
        car.tire = car.stops[car.stopIdx].to_tire;
        car.age = 0;
        car.stopIdx++;
      }
    }
  }

  return cars.sort((a, b) => (a.totalTime - b.totalTime) || (a.grid - b.grid));
}

function evaluate(cases, p) {
  let exact = 0;
  for (const c of cases) {
    const results = simulateAdditive(c.input, p);
    if (results.map(x => x.id).join(',') === c.expected.join(',')) exact++;
  }
  return exact;
}

// Fixed-count random search to test theory
function main() {
  const cases = loadTestCases();
  console.log('Testing Additive Model Theory...');
  let maxRate = 0;
  for (let i = 0; i < 2000; i++) {
      const p = [
        -2 + Math.random()*2, 0, 1 + Math.random()*2, // offsets (absolute seconds)
        Math.random()*0.1, Math.random()*0.1, Math.random()*0.1, // temp
        Math.random()*0.5, Math.random()*0.5, Math.random()*0.5, // d1
        Math.random()*0.02, Math.random()*0.02, Math.random()*0.02, // d2
        Math.random()*1, Math.random()*1, Math.random()*1, // fresh
        Math.random()*1, // pit exit
        Math.floor(Math.random()*15), Math.floor(Math.random()*25), Math.floor(Math.random()*40), // shelf
        Math.random()*0.5 // queue
      ];
      const rate = evaluate(cases, p);
      if (rate > maxRate) {
          maxRate = rate;
          console.log(`Additive New Best: ${maxRate}/100`);
      }
  }
}

main();
