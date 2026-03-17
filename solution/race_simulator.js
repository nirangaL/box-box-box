const fs = require('fs');
const path = require('path');

/**
 * FINAL RACE SIMULATOR
 * 
 * Features:
 * - Relative Standard Shelf Model
 * - Pit Stop Queue Penalty (based on arrival order)
 * - Explicit grid-based tie-breaking
 */

function loadParams() {
  const p = path.join(__dirname, 'learned_params.json');
  if (fs.existsSync(p)) {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (data && data.params) return data.params;
  }
  return null;
}

const params = loadParams();

// Fallback defaults
const defaults = {
  offset: { SOFT: -0.045, MEDIUM: -0.035, HARD: -0.025 },
  tempCoeff: { SOFT: 0.015, MEDIUM: 0.015, HARD: 0.015 },
  degr1: { SOFT: 0.02, MEDIUM: 0.01, HARD: 0.005 },
  degr2: { SOFT: 0.0001, MEDIUM: 0.00005, HARD: 0.00001 },
  freshBonus: { SOFT: -0.5, MEDIUM: -0.5, HARD: -0.5 },
  pitExitPenalty: 0.2,
  shelfLife: { SOFT: 10, MEDIUM: 20, HARD: 30 },
  queuePenalty: 0.5
};

function get(group, tire, fallback) {
  if (params && params[group] && params[group][tire] !== undefined) return params[group][tire];
  if (params && params[group] !== undefined && typeof params[group] !== 'object') return params[group];
  if (defaults[group] && defaults[group][tire] !== undefined) return defaults[group][tire];
  return defaults[group] !== undefined ? defaults[group] : fallback;
}

function simulate(race) {
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
    // 1. Lap times
    for (const car of cars) {
      car.age++;
      const tire = car.tire;
      const shelf = get('shelfLife', tire, 0);
      const wearAge = Math.max(0, car.age - shelf);
      const tempDelta = temp - 30;
      const wearEffect = (get('degr1', tire, 0) * wearAge + get('degr2', tire, 0) * wearAge * wearAge) * (1 + get('tempCoeff', tire, 0) * tempDelta);
      
      const lapTime = base * (1 + get('offset', tire, 0) + wearEffect)
        + (car.age === 1 ? get('freshBonus', tire, 0) : 0)
        + (car.stopIdx > 0 && car.age === 1 ? get('pitExitPenalty', tire, 0) : 0);
        
      car.totalTime += lapTime;
    }

    // 2. Pit stops
    const pittingIndices = [];
    for (let i = 0; i < 20; i++) {
      if (cars[i].stopIdx < cars[i].stops.length && cars[i].stops[cars[i].stopIdx].lap === lap) {
        pittingIndices.push(i);
      }
    }

    if (pittingIndices.length > 0) {
      pittingIndices.sort((a, b) => {
        const ca = cars[a], cb = cars[b];
        if (Math.abs(ca.totalTime - cb.totalTime) < 1e-9) return ca.grid - cb.grid;
        return ca.totalTime - cb.totalTime;
      });

      for (let q = 0; q < pittingIndices.length; q++) {
        const car = cars[pittingIndices[q]];
        car.totalTime += pit + q * get('queuePenalty', null, 0);
        car.tire = car.stops[car.stopIdx].to_tire;
        car.age = 0;
        car.stopIdx++;
      }
    }
  }

  return cars.sort((a, b) => {
    if (Math.abs(a.totalTime - b.totalTime) < 1e-9) return a.grid - b.grid;
    return a.totalTime - b.totalTime;
  }).map(x => x.id);
}

function runFromStdin() {
  const chunks = [];
  process.stdin.on('data', chunk => chunks.push(chunk));
  process.stdin.on('end', () => {
    const input = Buffer.concat(chunks).toString().trim();
    if (!input) return;
    try {
      const race = JSON.parse(input);
      const finishing = simulate(race);
      const output = { race_id: race.race_id, finishing_positions: finishing };
      process.stdout.write(JSON.stringify(output) + '\n');
    } catch (err) {
      console.error(err.message || String(err));
      process.exit(1);
    }
  });
}

if (require.main === module) runFromStdin();
module.exports = { simulate };
