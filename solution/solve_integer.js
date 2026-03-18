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

function simulate(race, p) {
    const { base_lap_time: base, track_temp: temp, pit_lane_time: pit, total_laps: total } = race.race_config;
    const cars = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        // Incorporate the 0.01s grid gap fundamental
        cars.push({ id: s.driver_id, grid: i, tire: s.starting_tire, age: 0, time: (i-1)*0.01, stops: s.pit_stops || [], si: 0 });
    }
    
    const tDelta = temp - 30;
    for (let lap = 1; lap <= total; lap++) {
        const fuelEffect = -p.fuelBurn * (lap - 1);
        for (const c of cars) {
            c.age++;
            const ti = c.tire[0] === 'S' ? 'SOFT' : c.tire[0] === 'M' ? 'MEDIUM' : 'HARD';
            
            // Linear model - no quadratic wear
            const wearRate = p.degr[ti] * (1 + p.tempCoeff[ti] * tDelta);
            const wearEffect = Math.max(0, c.age - p.shelf[ti]) * wearRate;
            
            let lapTime = base * (1 + p.offset[ti]) + wearEffect + fuelEffect;
            
            // Fresh tire bonus on first lap of any stint
            if (c.age === 1) lapTime += p.freshBonus[ti];
            // Pit exit penalty for all stops except race start
            if (c.si > 0 && c.age === 1) lapTime += p.pitExitPenalty;
            
            c.time += lapTime;
        }
        let pitting = cars.filter(c => c.si < c.stops.length && c.stops[c.si].lap === lap);
        pitting.sort((a,b) => (a.time - b.time) || (a.grid - b.grid));
        pitting.forEach((c, q) => {
            c.time += pit + q * p.queuePenalty;
            c.tire = c.stops[c.si].to_tire; c.age = 0; c.si++;
        });
    }
    return cars.sort((a,b) => (a.time - b.time) || (a.grid - b.grid)).map(x => x.id);
}

const cases = loadTestCases();

// Search for Clean Constants
const candidates = [];
const degrs = [[0.02, 0.01, 0.005], [0.03, 0.015, 0.007], [0.04, 0.022, 0.011]];
const fuelBurns = [0, 0.01, 0.02, 0.03];
const queuePenalties = [0, 0.1, 0.2, 0.5];

console.log('Searching for Fundamental Integer Model...');

let bestScore = 0;
for (const d of degrs) {
  for (const fb of fuelBurns) {
    for (const qp of queuePenalties) {
      const p = {
        degr: { SOFT: d[0], MEDIUM: d[1], HARD: d[2] },
        offset: { SOFT: -0.05, MEDIUM: -0.03, HARD: -0.01 },
        tempCoeff: { SOFT: 0.02, MEDIUM: 0.02, HARD: 0.02 },
        fuelBurn: fb,
        freshBonus: { SOFT: -0.5, MEDIUM: -0.5, HARD: -0.5 },
        pitExitPenalty: 0.2,
        shelf: { SOFT: 10, MEDIUM: 20, HARD: 30 },
        queuePenalty: qp
      };
      
      let ok = 0;
      for (const c of cases) if (JSON.stringify(simulate(c.input, p)) === JSON.stringify(c.expected)) ok++;
      if (ok > bestScore) {
        bestScore = ok;
        console.log(`New Best: ${ok}/100 [fb=${fb}, qp=${qp}, degr1=${d[0]}]`);
      }
    }
  }
}
