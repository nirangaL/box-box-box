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

function computeAllTimes(race, p) {
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
      
      // FORMULA: Everything is relative to Base Lap Time
      // Degradation scales with base time (longer tracks = more wear-time per lap)
      const wearEffect = (p[6+ti] * wearAge + p[9+ti] * wearAge * wearAge) * (1 + p[3+ti] * tempDelta);
      
      const lapTime = rc.base_lap_time * (1 + p[ti] + wearEffect)
        + (age === 1 ? p[12+ti] : 0)
        + (si > 0 && age === 1 ? p[15] : 0);
      
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

function score(races, p) {
  let exact = 0, pairs = 0, total = 0;
  for (const r of races) {
    const times = computeAllTimes(r, p);
    const truth = r.finishing_positions;
    const pred = Object.entries(times).sort((a,b)=>a[1]-b[1]).map(e=>e[0]);
    if (JSON.stringify(pred) === JSON.stringify(truth)) exact++;
    for (let i = 0; i < truth.length; i++) {
        for (let j = i + 1; j < truth.length; j++) {
            total++;
            if (times[truth[i]] < times[truth[j]]) pairs++;
        }
    }
  }
  return exact * 1000 + (pairs / total);
}

const RANGES = [
  [-0.05, 0.05], [-0.05, 0.05], [-0.05, 0.05],     // offset
  [0, 0.1], [0, 0.1], [0, 0.1],                  // temp
  [0, 0.05], [0, 0.05], [0, 0.05],               // d1 (scaled)
  [0, 0.005], [0, 0.005], [0, 0.005],            // d2 (scaled)
  [-1, 1], [-1, 1], [-1, 1],                     // fresh
  [-0.5, 0.5],                                   // pit
  [0, 15], [0, 25], [0, 35]                      // shelf
];

async function main() {
  const races = loadRaces(2).slice(0, 500);
  const popSize = 40;
  const F = 0.8, CR = 0.9;
  
  let population = Array.from({length: popSize}, () => {
    return Array.from({length: 19}, (_, i) => RANGES[i][0] + Math.random() * (RANGES[i][1] - RANGES[i][0]));
  });
  
  try {
     const saved = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;
     population[0] = [
         saved.offset.SOFT, saved.offset.MEDIUM, saved.offset.HARD,
         saved.tempCoeff.SOFT, saved.tempCoeff.MEDIUM, saved.tempCoeff.HARD,
         saved.degr1.SOFT, saved.degr1.MEDIUM, saved.degr1.HARD,
         saved.degr2.SOFT, saved.degr2.MEDIUM, saved.degr2.HARD,
         saved.freshBonus.SOFT, saved.freshBonus.MEDIUM, saved.freshBonus.HARD,
         saved.pitExitPenalty,
         saved.shelfLife ? saved.shelfLife.SOFT : 0,
         saved.shelfLife ? saved.shelfLife.MEDIUM : 0,
         saved.shelfLife ? saved.shelfLife.HARD : 0
     ];
  } catch(e) {}

  let scores = population.map((p, i) => {
      const s = score(races, p);
      if (i === 0) console.log(`Initial Score: ${Math.floor(s/1000)}/500 (${(s%1000).toFixed(4)} pairs)`);
      return s;
  });
  let bestIdx = scores.indexOf(Math.max(...scores));
  
  console.log('Optimizing Relative Formula with DE...');

  for (let gen = 0; gen < 2000; gen++) {
    for (let i = 0; i < popSize; i++) {
        let a, b, c;
        do { a = Math.floor(Math.random() * popSize); } while (a === i);
        do { b = Math.floor(Math.random() * popSize); } while (b === i || b === a);
        do { c = Math.floor(Math.random() * popSize); } while (c === i || c === a || c === b);
        
        const mutant = population[a].map((val, idx) => {
            if (Math.random() < CR || idx === Math.floor(Math.random() * 19)) {
                let v = val + F * (population[b][idx] - population[c][idx]);
                return Math.max(RANGES[idx][0], Math.min(RANGES[idx][1], v));
            }
            return population[i][idx];
        });
        const mutantScore = score(races, mutant);
        if (mutantScore > scores[i]) {
            population[i] = mutant;
            scores[i] = mutantScore;
            if (mutantScore > scores[bestIdx]) {
                bestIdx = i;
                console.log(`Gen ${gen} Exact: ${Math.floor(mutantScore/1000)}/2000`);
                save(population[bestIdx], mutantScore);
            }
        }
    }
  }
}

function save(p, s) {
  const result = {
    params: {
      offset: { SOFT: p[0], MEDIUM: p[1], HARD: p[2] },
      tempCoeff: { SOFT: p[3], MEDIUM: p[4], HARD: p[5] },
      degr1: { SOFT: p[6], MEDIUM: p[7], HARD: p[8] },
      degr2: { SOFT: p[9], MEDIUM: p[10], HARD: p[11] },
      freshBonus: { SOFT: p[12], MEDIUM: p[13], HARD: p[14] },
      pitExitPenalty: p[15],
      shelfLife: { SOFT: p[16], MEDIUM: p[17], HARD: p[18] }
    },
    score: s
  };
  fs.writeFileSync('solution/learned_params.json', JSON.stringify(result, null, 2));
}

main();
