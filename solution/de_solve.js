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
  [-0.04, -0.01], [-0.015, 0.015], [0.01, 0.04],    // offset (SOFT, MEDIUM, HARD)
  [0, 0.1], [0, 0.1], [0, 0.1],                     // temp coeff
  [0.001, 0.02], [0.0005, 0.01], [0.0001, 0.005],  // d1 (SOFT > MEDIUM > HARD)
  [0.0001, 0.002], [0, 0.001], [0, 0.0005],         // d2 
  [-0.1, 0.1], [-0.1, 0.1], [-0.1, 0.1],            // fresh bonus
  [-0.1, 0.1],                                      // pit penalty
  [0, 10], [5, 20], [10, 40]                        // shelf (SOFT < MEDIUM < HARD)
];

async function main() {
  const races = loadRaces(5); // 5000 races
  console.log(`Loaded ${races.length} races`);
  
  const popSize = 60;
  const F = 0.5, CR = 0.9;
  
  let population = Array.from({length: popSize}, () => {
    return Array.from({length: 19}, (_, i) => RANGES[i][0] + Math.random() * (RANGES[i][1] - RANGES[i][0]));
  });
  
  let scores = population.map((p, i) => score(races, p));
  let bestIdx = scores.indexOf(Math.max(...scores));
  
  console.log(`Starting Score: ${scores[bestIdx].toFixed(4)}`);

  for (let gen = 0; gen < 5000; gen++) {
    for (let i = 0; i < popSize; i++) {
        let a, b, c;
        do { a = Math.floor(Math.random() * popSize); } while (a === i);
        do { b = Math.floor(Math.random() * popSize); } while (b === i || b === a);
        do { c = Math.floor(Math.random() * popSize); } while (c === i || c === a || c === b);
        
        const mutant = population[a].map((val, idx) => {
            if (Math.random() < CR || idx === Math.floor(Math.random() * 19)) {
                let v = val + F * (population[b][idx] - population[c][idx]);
                // Reflect instead of Clip to preserve diversity
                if (v < RANGES[idx][0]) v = RANGES[idx][0] + (RANGES[idx][0] - v) % (RANGES[idx][1] - RANGES[idx][0]);
                if (v > RANGES[idx][1]) v = RANGES[idx][1] - (v - RANGES[idx][1]) % (RANGES[idx][1] - RANGES[idx][0]);
                return v;
            }
            return population[i][idx];
        });
        
        const s = score(races, mutant);
        if (s > scores[i]) {
            population[i] = mutant;
            scores[i] = s;
            if (s > scores[bestIdx]) {
                bestIdx = i;
                console.log(`Gen ${gen} Best Exact: ${Math.floor(s/1000)}/${races.length} (${(s % 1000).toFixed(4)})`);
                save(population[bestIdx], s);
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
    version: "Relative-Standard-Shelf",
    score: s
  };
  fs.writeFileSync('solution/learned_params.json', JSON.stringify(result, null, 2));
}

main();
