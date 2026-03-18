const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'historical_races');

function loadRace(id) {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();
  for (let f of files) {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
      const r = data.find(x => x.race_id === id);
      if (r) return r;
  }
}

function simulate(race, p) {
  const rc = race.race_config;
  const times = {};
  for (const s of Object.values(race.strategies)) {
    let cur = s.starting_tire, age = 0, t = 0;
    const stops = (s.pit_stops || []).slice().sort((a,b)=>a.lap-b.lap);
    let si = 0;
    for (let lap = 1; lap <= rc.total_laps; lap++) {
      age++;
      const ti = cur[0] === 'S' ? 0 : cur[0] === 'M' ? 1 : 2;
      const wearAge = Math.max(0, age - p[16+ti]);
      const lapTime = rc.base_lap_time * (1 + p[ti]) + p[6+ti]*wearAge; // Linear wear
      t += lapTime;
      if (si < stops.length && lap === stops[si].lap) {
        t += rc.pit_lane_time; cur = stops[si].to_tire; age = 0; si++;
      }
    }
    times[s.driver_id] = t;
  }
  return times;
}

function main() {
  const r = loadRace('R21072');
  console.log('Testing Long Flat Periods Hypothesis...');
  const p = [
      -0.02, 0.0, 0.02, // offsets (S fastest)
      0,0,0, // temp ignored
      1.0, 0.5, 0.2, // d1 (high degradation after shelf)
      0,0,0, // d2 
      0,0,0, // fresh
      0, // pit
      5, 15, 30 // shelf (S=5, M=15, H=30)
  ];
  
  const times = simulate(r, p);
  const pred = Object.entries(times).sort((a,b)=>a[1]-b[1]).map(e=>e[0]);
  console.log('Pred Top 5:', JSON.stringify(pred.slice(0, 5)));
  console.log('True Top 5:', JSON.stringify(r.finishing_positions.slice(0, 5)));
  
  if (JSON.stringify(pred) === JSON.stringify(r.finishing_positions)) {
      console.log('PERFECT MATCH!');
  } else {
      let common = 0;
      for (let i=0; i<20; i++) if (pred[i] === r.finishing_positions[i]) common++;
      console.log('Common positions:', common, '/ 20');
  }
}
main();
