const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'historical_races');

function loadRaces(n) {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, files[0]), 'utf8')).slice(0, n);
}

function computeTimes(r, p) {
  const rc = r.race_config;
  const times = {};
  for (const s of Object.values(r.strategies)) {
    let cur = s.starting_tire, age = 0, t = 0;
    const stops = (s.pit_stops || []).slice().sort((a,b)=>a.lap-b.lap);
    let si = 0;
    for (let lap = 1; lap <= rc.total_laps; lap++) {
      age++;
      const ti = cur[0] === 'S' ? 0 : cur[0] === 'M' ? 1 : 2;
      const wear = age - p[16+ti]; // No max(0, ...) yet for simplicity
      const wearAge = wear > 0 ? wear : 0;
      
      // RELATIVE FORMULA
      const lapTime = rc.base_lap_time * (1 + p[ti] + (p[6+ti]*wearAge + p[9+ti]*wearAge*wearAge) * (1 + p[3+ti]*(rc.track_temp-30)))
         + (age === 1 ? p[12+ti] : 0)
         + (si > 0 && age === 1 ? p[15] : 0);
      
      t += lapTime;
      if (si < stops.length && lap === stops[si].lap) {
        t += rc.pit_lane_time; cur = stops[si].to_tire; age = 0; si++;
      }
    }
    times[s.driver_id] = t;
  }
  return times;
}

function check(races, p) {
  let ok = 0;
  for (let r of races) {
    const t = computeTimes(r, p);
    const pred = Object.entries(t).sort((a,b)=>a[1]-b[1]).map(e=>e[0]);
    if (JSON.stringify(pred) === JSON.stringify(r.finishing_positions)) ok++;
  }
  return ok;
}

// Random search on just 10 races
function main() {
  const races = loadRaces(10);
  console.log('Solving exactly for 10 races...');
  let best = 0;
  for (let i = 0; i < 5000; i++) {
    const p = [
      -0.015 + Math.random()*0.01, -0.005 + Math.random()*0.01, 0.005 + Math.random()*0.01, // offsets
      Math.random()*0.05, Math.random()*0.05, Math.random()*0.05, // temp
      Math.random()*0.01, Math.random()*0.01, Math.random()*0.005, // d1
      Math.random()*0.0002, Math.random()*0.0001, Math.random()*0.00005, // d2
      0,0,0, // fresh
      0, // pit
      Math.floor(Math.random()*5), Math.floor(Math.random()*10), Math.floor(Math.random()*15) // shelf
    ];
    const ok = check(races, p);
    if (ok > best) {
      best = ok;
      console.log(`Found ${best}/10 matches`);
      if (best === 10) {
        console.log('SUCCESS! Params:', JSON.stringify(p));
        return;
      }
    }
  }
}
main();
