/**
 * REFINED PRECISION SOLVER
 * 
 * Formula:
 * wearAge = max(0, age - shelfLife)
 * lapTime = base * (1 + offset) 
 *         + (d1 * wearAge + d2 * wearAge^2) * (1 + temp * (tempTrack - 30))
 *         + (age == 1 ? fresh : 0)
 *         + (isPitExit ? pitPenalty : 0)
 * 
 * This model matches the regulations:
 * - "Initial performance period" (shelfLife)
 * - "Temperature impacts how tires degrade" (multiplicative)
 * - "Age increments before calculation" (handled by age starting at 1)
 */

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
    const stops = (strat.pit_stops || []).slice().sort((a, b) => a.lap - b.lap);
    let si = 0;
    for (let lap = 1; lap <= rc.total_laps; lap++) {
      age++;
      const ti = cur === 'SOFT' ? 0 : cur === 'MEDIUM' ? 1 : 2;
      
      const shelf = p[16 + ti];
      const wearAge = Math.max(0, age - shelf);
      const tempMul = 1 + p[3 + ti] * (rc.track_temp - 30);
      
      const lapTime = rc.base_lap_time * (1 + p[ti])
        + (p[6 + ti] * wearAge + p[9 + ti] * wearAge * wearAge) * tempMul
        + (age === 1 ? p[12 + ti] : 0)
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
  let exact = 0;
  let pairwiseCorrect = 0, pairwiseTotal = 0;
  for (const r of races) {
    const times = computeAllTimes(r, p);
    const pred = Object.entries(times).sort((a, b) => a[1] - b[1]).map(e => e[0]);
    const truth = r.finishing_positions;
    if (JSON.stringify(pred) === JSON.stringify(truth)) exact++;
    for (let i = 0; i < truth.length; i++) {
      for (let j = i + 1; j < truth.length; j++) {
        pairwiseTotal++;
        if (times[truth[i]] < times[truth[j]]) pairwiseCorrect++;
      }
    }
  }
  return exact * 1000000 + pairwiseCorrect;
}

const NAMES = [
  'offS', 'offM', 'offH',
  'tmpS', 'tmpM', 'tmpH',
  'd1S', 'd1M', 'd1H',
  'd2S', 'd2M', 'd2H',
  'frS', 'frM', 'frH',
  'pit',
  'shS', 'shM', 'shH'
];

const RANGES = [
  [-0.05, 0.05], [-0.05, 0.05], [-0.05, 0.05],    // offset
  [0, 0.1], [0, 0.1], [0, 0.1],                  // tempCoeff
  [0, 0.5], [0, 0.5], [0, 0.5],                  // d1
  [0, 0.05], [0, 0.05], [0, 0.05],               // d2
  [-2, 2], [-2, 2], [-2, 2],                     // fresh
  [-1, 1],                                       // pit
  [0, 10], [0, 20], [0, 30]                      // shelfLife
];

function searchParam(races, p, idx) {
  const [lo, hi] = RANGES[idx];
  let bestVal = p[idx], bestS = score(races, p);
  
  const steps = [100, 50, 50];
  let curLo = lo, curHi = hi;
  
  for (const n of steps) {
    const step = (curHi - curLo) / n;
    for (let v = curLo; v <= curHi; v += step) {
      p[idx] = v;
      const s = score(races, p);
      if (s > bestS) { bestS = s; bestVal = v; }
    }
    const r = (curHi - curLo) / n * 2;
    curLo = Math.max(lo, bestVal - r);
    curHi = Math.min(hi, bestVal + r);
  }
  p[idx] = bestVal;
  return bestS;
}

function main() {
  console.log('=== GLOBAL STRATEGY OPTIMIZER ===');
  const races = loadRaces(2); // Start with smaller set for speed
  console.log(`Loaded ${races.length} races\n`);

  // Initialize with reasonable defaults
  let p = new Array(19).fill(0);
  // Offsets
  p[0] = -0.01; p[1] = 0; p[2] = 0.01;
  // d1
  p[6] = 0.1; p[7] = 0.05; p[8] = 0.02;
  // d2
  p[9] = 0.002; p[10] = 0.0005; p[11] = 0.0001;
  // temp
  p[3] = 0.01; p[4] = 0.01; p[5] = 0.01;
  
  // Try to load any existing best
  const pFile = path.join(__dirname, 'learned_params.json');
  if (fs.existsSync(pFile)) {
     try {
       const saved = JSON.parse(fs.readFileSync(pFile, 'utf8')).params;
       if (saved.offset) {
         p[0] = saved.offset.SOFT; p[1] = saved.offset.MEDIUM; p[2] = saved.offset.HARD;
         p[3] = saved.tempCoeff.SOFT; p[4] = saved.tempCoeff.MEDIUM; p[5] = saved.tempCoeff.HARD;
         p[6] = saved.degr1.SOFT; p[7] = saved.degr1.MEDIUM; p[8] = saved.degr1.HARD;
         p[9] = saved.degr2.SOFT; p[10] = saved.degr2.MEDIUM; p[11] = saved.degr2.HARD;
         p[12] = saved.freshBonus.SOFT; p[13] = saved.freshBonus.MEDIUM; p[14] = saved.freshBonus.HARD;
         p[15] = saved.pitExitPenalty;
         if (saved.shelfLife) {
            p[16] = saved.shelfLife.SOFT; p[17] = saved.shelfLife.MEDIUM; p[18] = saved.shelfLife.HARD;
         }
       }
     } catch(e) {}
  }

  let curS = score(races, p);
  console.log(`Initial exact: ${Math.floor(curS/1000000)}/${races.length}`);

  for (let sweep = 0; sweep < 20; sweep++) {
    let improved = false;
    for (let i = 0; i < p.length; i++) {
      const oldS = curS;
      curS = searchParam(races, p, i);
      if (curS > oldS) {
        improved = true;
        console.log(`  ${NAMES[i]}: ${p[i].toFixed(6)} exact=${Math.floor(curS/1000000)}`);
      }
    }
    console.log(`Sweep ${sweep} done. Exact: ${Math.floor(curS/1000000)}/${races.length}`);
    
    // Save every sweep
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
      score: curS
    };
    fs.writeFileSync(pFile, JSON.stringify(result, null, 2));

    if (!improved) break;
  }
  
  console.log('Optimization complete.');
}

main();
