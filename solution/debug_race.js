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
  for (const strat of Object.values(race.strategies)) {
    let cur = strat.starting_tire, age = 0, t = 0;
    const stops = (strat.pit_stops || []).slice().sort((a,b)=>a.lap-b.lap);
    let si = 0;
    for (let lap = 1; lap <= rc.total_laps; lap++) {
      age++;
      const ti = cur[0] === 'S' ? 0 : cur[0] === 'M' ? 1 : 2;
      const shelf = Math.round(p[16+ti]);
      const wearAge = Math.max(0, age - shelf);
      const lapTime = rc.base_lap_time * (1 + p[ti]) 
        + p[3+ti] * (rc.track_temp - 30)
        + (p[6+ti] * wearAge + p[9+ti] * wearAge * wearAge);
      t += lapTime;
      if (si < stops.length && lap === stops[si].lap) {
        t += rc.pit_lane_time; cur = stops[si].to_tire; age = 0; si++;
      }
    }
    times[strat.driver_id] = t;
  }
  return times;
}

function main() {
  const r = loadRace('R21072');
  const learned = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;
  const p = [
      learned.offset.SOFT, learned.offset.MEDIUM, learned.offset.HARD,
      learned.tempCoeff.SOFT, learned.tempCoeff.MEDIUM, learned.tempCoeff.HARD,
      learned.degr1.SOFT, learned.degr1.MEDIUM, learned.degr1.HARD,
      learned.degr2.SOFT, learned.degr2.MEDIUM, learned.degr2.HARD,
      learned.freshBonus.SOFT, learned.freshBonus.MEDIUM, learned.freshBonus.HARD,
      learned.pitExitPenalty,
      learned.shelfLife ? learned.shelfLife.SOFT : 0,
      learned.shelfLife ? learned.shelfLife.MEDIUM : 0,
      learned.shelfLife ? learned.shelfLife.HARD : 0
  ];

  console.log('Testing SOFT degradation vs HARD performance...');
  for (let d = 0; d < 20; d++) {
      p[6] = d * 0.1; // d1 SOFT
      const times = simulate(r, p);
      const pos01 = r.finishing_positions.indexOf('D001');
      const pos11 = r.finishing_positions.indexOf('D011');
      const time01 = times['D001'];
      const time11 = times['D011'];
      console.log(`d1S=${p[6].toFixed(1)}: D001 time=${time01.toFixed(2)}, D011 time=${time11.toFixed(2)}, Diff=${(time11-time01).toFixed(2)}`);
  }
}

main();
