const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'historical_races');

function loadRaces(numFiles) {
  let races = [];
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();
  for (let i = 0; i < Math.min(numFiles, files.length); i++) {
    races = races.concat(JSON.parse(fs.readFileSync(path.join(DATA_DIR, files[i]), 'utf8')));
  }
  return races;
}

function simulate(race, p, variant) {
  const rc = race.race_config;
  const times = {};
  for (const strat of Object.values(race.strategies)) {
    let cur = strat.starting_tire, age = 0, t = 0;
    const stops = (strat.pit_stops || []).slice().sort((a,b)=>a.lap-b.lap);
    let si = 0;
    for (let lap = 1; lap <= rc.total_laps; lap++) {
      age++;
      const ti = cur[0] === 'S' ? 0 : cur[0] === 'M' ? 1 : 2;
      const shelf = Math.round(p[16+ti]);
      const wearAge = Math.max(0, age - shelf);
      const tempDelta = rc.track_temp - 30;
      
      let lapTime;
      // Variant 6: Unified Multiplicative
      lapTime = (rc.base_lap_time + p[ti]) * (1 + p[6+ti]*wearAge + p[9+ti]*wearAge*wearAge + p[3+ti]*tempDelta);
      
      lapTime += (age === 1 ? p[12+ti] : 0);
      lapTime += (si > 0 && age === 1 ? p[15] : 0);
      
      t += lapTime;
      if (si < stops.length && lap === stops[si].lap) {
        t += rc.pit_lane_time;
        cur = stops[si].to_tire; age = 0; si++;
      }
    }
    times[strat.driver_id] = t;
  }
  return times;
}

function main() {
  const races = loadRaces(1).slice(0, 500);
  console.log('Testing Variant 6 (Unified Multiplicative)...');
  
  let best = 0;
  for (let i = 0; i < 2000; i++) {
      const p = Array.from({length: 19}, (_, idx) => {
          if (idx < 3) return (Math.random() - 0.5) * 4; // offset in seconds
          if (idx < 6) return (Math.random() - 0.5) * 0.01; // temp scale
          if (idx < 9) return Math.random() * 0.02; // d1
          if (idx < 12) return Math.random() * 0.001; // d2
          if (idx < 15) return (Math.random() - 0.5) * 2;
          if (idx === 15) return (Math.random() - 0.5) * 1;
          return Math.floor(Math.random() * 20);
      });
      let exact = 0;
      for (const r of races) {
          const times = simulate(r, p, 6);
          const pred = Object.entries(times).sort((a,b)=>a[1]-b[1]).map(e=>e[0]);
          if (JSON.stringify(pred) === JSON.stringify(r.finishing_positions)) exact++;
      }
      if (exact > best) {
          best = exact;
          console.log(`Iteration ${i} Best: ${best}/500`);
      }
  }
}

main();
