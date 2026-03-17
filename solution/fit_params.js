const fs = require('fs');
const path = require('path');

// Constants
const DATA_DIR = path.join(__dirname, '..', 'data', 'historical_races');
const TEST_INPUTS_DIR = path.join(__dirname, '..', 'data', 'test_cases', 'inputs');
const TEST_EXPECTED_DIR = path.join(__dirname, '..', 'data', 'test_cases', 'expected_outputs');

function loadRaces(numFiles = 5) {
  let races = [];
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();
  for (let i = 0; i < Math.min(numFiles, files.length); i++) {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, files[i]), 'utf8'));
    races = races.concat(data);
  }
  return races;
}

function simulate(race, p) {
  const times = {};
  const rc = race.race_config;
  for (const strat of Object.values(race.strategies)) {
    let cur = strat.starting_tire;
    let age = 0;
    let t = 0;
    const stops = (strat.pit_stops || []).slice().sort((a, b) => a.lap - b.lap);
    let si = 0;
    for (let lap = 1; lap <= rc.total_laps; lap++) {
      age += 1;
      const shelf = p.shelfLife[cur];
      const wearAge = Math.max(0, age - shelf);
      
      // Temperature affects degradation rate
      const effectiveDegr1 = p.degr1[cur] + p.tempCoeff[cur] * (rc.track_temp - 30);
      
      // Formula refined based on regulations: "Temperature impacts how tires degrade"
      const lapTime = rc.base_lap_time * (1 + p.offset[cur])
        + effectiveDegr1 * wearAge
        + p.degr2[cur] * wearAge * wearAge
        + (age === 1 ? p.freshBonus[cur] : 0)
        + (si > 0 && age === 1 ? p.pitExitPenalty : 0);
      t += lapTime;
      if (si < stops.length && lap === stops[si].lap) {
        t += rc.pit_lane_time;
        cur = stops[si].to_tire;
        age = 0;
        si += 1;
      }
    }
    times[strat.driver_id] = t;
  }
  return Object.entries(times).sort((a, b) => a[1] - b[1]).map(e => e[0]);
}

function scoreAccuracy(races, params) {
  let correct = 0;
  for (const r of races) {
    const pred = simulate(r, params);
    if (JSON.stringify(pred) === JSON.stringify(r.finishing_positions)) {
      correct++;
    }
  }
  return correct / races.length;
}

function kendallTau(trueOrder, predOrder) {
  const pos = new Map(predOrder.map((d, i) => [d, i]));
  let c = 0, total = 0;
  for (let i = 0; i < trueOrder.length; i++) {
    for (let j = i + 1; j < trueOrder.length; j++) {
      total++;
      if (pos.get(trueOrder[i]) < pos.get(trueOrder[j])) c++;
    }
  }
  return c / total;
}

function evaluate(races, params) {
  let tauSum = 0;
  let exactCount = 0;
  for (const r of races) {
    const pred = simulate(r, params);
    const tau = kendallTau(r.finishing_positions, pred);
    tauSum += tau;
    if (tau === 1.0) exactCount++;
  }
  const avgTau = tauSum / races.length;
  const acc = exactCount / races.length;
  // Combine Tau and Accuracy. Accuracy is much harder, so give it a big weight.
  return avgTau + acc * 10; 
}

function randomParams() {
  const ru = (a, b) => a + Math.random() * (b - a);
  return {
    offset: { 
      SOFT: ru(-0.02, -0.005), 
      MEDIUM: ru(-0.005, 0.005), 
      HARD: ru(0.005, 0.02) 
    },
    degr1: { 
      SOFT: ru(0.05, 0.15), 
      MEDIUM: ru(0.03, 0.1), 
      HARD: ru(0.01, 0.05) 
    },
    degr2: { 
      SOFT: ru(0.001, 0.005), 
      MEDIUM: ru(0.0005, 0.002), 
      HARD: ru(0.0001, 0.001) 
    },
    tempCoeff: { 
      SOFT: ru(0.01, 0.05), 
      MEDIUM: ru(0.01, 0.05), 
      HARD: ru(0.01, 0.05) 
    },
    freshBonus: { 
      SOFT: ru(-0.5, -0.1), 
      MEDIUM: ru(-0.4, -0.1), 
      HARD: ru(-0.3, -0.1) 
    },
    shelfLife: {
      SOFT: ru(0, 5),
      MEDIUM: ru(2, 10),
      HARD: ru(5, 20)
    },
    pitExitPenalty: ru(-0.2, 0.1),
  };
}

function jitter(p, scale = 1.0) {
  const res = JSON.parse(JSON.stringify(p));
  const nudge = (v, amt) => v + (Math.random() * 2 - 1) * amt * scale;
  
  for (const k of ['SOFT', 'MEDIUM', 'HARD']) {
    res.offset[k] = nudge(res.offset[k], 0.001);
    res.degr1[k] = Math.max(0, nudge(res.degr1[k], 0.005));
    res.degr2[k] = Math.max(0, nudge(res.degr2[k], 0.0002));
    res.tempCoeff[k] = nudge(res.tempCoeff[k], 0.002);
    res.freshBonus[k] = nudge(res.freshBonus[k], 0.02);
    res.shelfLife[k] = Math.max(0, nudge(res.shelfLife[k], 0.5));
  }
  res.pitExitPenalty = nudge(res.pitExitPenalty, 0.02);
  return res;
}

async function main() {
  console.log('Loading data...');
  const races = loadRaces(2); // 2000 races for faster iteration
  console.log(`Loaded ${races.length} races.`);

  let best = { params: randomParams(), score: 0 };
  const pPath = path.join(__dirname, 'learned_params.json');
  if (fs.existsSync(pPath)) {
    const saved = JSON.parse(fs.readFileSync(pPath, 'utf8'));
    // Patch saved params if shelfLife is missing
    if (!saved.params.shelfLife) {
        saved.params.shelfLife = { SOFT: 0, MEDIUM: 0, HARD: 0 };
    }
    best = { params: saved.params, score: evaluate(races, saved.params) };
    console.log(`Resuming from saved params (score=${best.score.toFixed(6)})`);
  }

  console.log('Starting precise optimization...');
  
  const CARS = ['SOFT', 'MEDIUM', 'HARD'];
  const FIELDS = ['offset', 'degr1', 'degr2', 'tempCoeff', 'freshBonus', 'shelfLife'];
  
  for (let iter = 0; iter < 50; iter++) {
    let improved = false;
    
    // 1. Precise coordinate descent on each parameter
    for (const field of FIELDS) {
      for (const tire of CARS) {
        const deltas = (field === 'shelfLife') ? [1, 2, 5] : [0.0001, 0.0005, 0.001, 0.005, 0.01];
        for (const d of deltas) {
          for (const sign of [-1, 1]) {
            const candidate = JSON.parse(JSON.stringify(best.params));
            candidate[field][tire] += d * sign;
            if (field === 'shelfLife') candidate[field][tire] = Math.max(0, candidate[field][tire]);
            const score = evaluate(races, candidate);
            if (score > best.score) {
              best = { params: candidate, score };
              improved = true;
              console.log(`iter=${iter} ${field}.${tire} += ${d*sign} score=${score.toFixed(6)}`);
            }
          }
        }
      }
    }
    
    // 2. Specialty fields
    const pitDeltas = [0.001, 0.005, 0.01, 0.05];
    for (const d of pitDeltas) {
      for (const sign of [-1, 1]) {
        const candidate = JSON.parse(JSON.stringify(best.params));
        candidate.pitExitPenalty += d * sign;
        const score = evaluate(races, candidate);
        if (score > best.score) {
          best = { params: candidate, score };
          improved = true;
          console.log(`iter=${iter} pitExitPenalty += ${d*sign} score=${score.toFixed(6)}`);
        }
      }
    }

    // 3. Jitter for escaping local minima
    if (!improved) {
      console.log('No improvements in sweep. Jittering...');
      for (let j = 0; j < 500; j++) {
        const candidate = jitter(best.params, 0.1);
        const score = evaluate(races, candidate);
        if (score > best.score) {
          best = { params: candidate, score };
          improved = true;
          console.log(`iter=${iter} Jitter improved score=${score.toFixed(6)}`);
          break; 
        }
      }
    }

    fs.writeFileSync(path.join(__dirname, 'learned_params.json'), JSON.stringify(best, null, 2));
    if (!improved) break;
  }

  console.log('Optimization complete. Best score:', best.score);
}

main();

