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

function simulate(race, p) {
  const rc = race.race_config;
  const times = {};
  for (const s of Object.values(race.strategies)) {
    let cur = s.starting_tire, age = 0, t = 0;
    const stops = (s.pit_stops || []).slice().sort((a,b)=>a.lap-b.lap);
    let si = 0;
    for (let lap = 1; lap <= rc.total_laps; lap++) {
      age++;
      const ti = cur === 'SOFT' ? 0 : cur === 'MEDIUM' ? 1 : 2;
      const wearAge = Math.max(0, age - p[16+ti]);
      const lapTime = rc.base_lap_time + p[ti] + (p[6+ti]*wearAge + p[9+ti]*wearAge*wearAge) * (1 + p[3+ti]*(rc.track_temp-30));
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
  const races = loadRaces(1).slice(0, 50); // 50 races
  console.log('Testing Discrete Theory...');
  
  // Try combinations of "Likely" real constants
  const offsets = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5];
  const degrades = [0.05, 0.1, 0.2, 0.3, 0.4];
  const shelves = [5, 10, 15, 20, 25, 30];
  
  let best = 0;
  for (let i = 0; i < 2000; i++) {
    const p = new Array(19).fill(0);
    p[0] = offsets[Math.floor(Math.random()*offsets.length)];
    p[1] = 0;
    p[2] = offsets[Math.floor(Math.random()*offsets.length)];
    p[6] = degrades[Math.floor(Math.random()*degrades.length)];
    p[7] = degrades[Math.floor(Math.random()*degrades.length)];
    p[8] = degrades[Math.floor(Math.random()*degrades.length)];
    p[16] = shelves[Math.floor(Math.random()*shelves.length)];
    p[17] = shelves[Math.floor(Math.random()*shelves.length)];
    p[18] = shelves[Math.floor(Math.random()*shelves.length)];
    
    let ok = 0;
    for (let r of races) {
        const t = simulate(r, p);
        const pred = Object.entries(t).sort((a,b)=>a[1]-b[1]).map(e=>e[0]);
        if (JSON.stringify(pred) === JSON.stringify(r.finishing_positions)) ok++;
    }
    if (ok > best) {
        best = ok;
        console.log(`Best: ${best}/50`);
    }
  }
}
main();
