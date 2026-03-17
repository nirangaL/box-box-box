/**
 * Fundamental Analysis Script
 * 
 * Goal: Reverse-engineer the exact lap time formula from historical data.
 * 
 * Strategy:
 * 1. Use Nelder-Mead (no gradients needed) for optimization
 * 2. Test multiple formula variants to find the TRUE model
 * 3. Use exact-match accuracy as the primary metric
 * 4. Use large dataset for validation
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'historical_races');

function loadRaces(numFiles) {
  let races = [];
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();
  for (let i = 0; i < Math.min(numFiles, files.length); i++) {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, files[i]), 'utf8'));
    races = races.concat(data);
  }
  return races;
}

// ============================================================================
// FORMULA VARIANTS - The key to solving this
// ============================================================================

// Variant A: Original model (additive temp effect)
// lapTime = base*(1+offset) + tempCoeff*(temp-30) + degr1*age + degr2*age^2 + freshBonus + pitPenalty
function totalTimeA(strat, rc, p) {
  let cur = strat.starting_tire, age = 0, t = 0;
  const stops = (strat.pit_stops || []).slice().sort((a,b) => a.lap - b.lap);
  let si = 0;
  for (let lap = 1; lap <= rc.total_laps; lap++) {
    age++;
    t += rc.base_lap_time * (1 + p[0 + 'SMH'.indexOf(cur[0])])         // offset per tire
       + p[3 + 'SMH'.indexOf(cur[0])] * (rc.track_temp - 30)           // temp coeff
       + p[6 + 'SMH'.indexOf(cur[0])] * age                            // linear degr
       + p[9 + 'SMH'.indexOf(cur[0])] * age * age                      // quadratic degr
       + (age === 1 ? p[12 + 'SMH'.indexOf(cur[0])] : 0)               // fresh bonus
       + (si > 0 && age === 1 ? p[15] : 0);                             // pit exit penalty
    if (si < stops.length && lap === stops[si].lap) {
      t += rc.pit_lane_time;
      cur = stops[si].to_tire;
      age = 0; si++;
    }
  }
  return t;
}

// Variant B: Temperature modifies degradation rate (multiplicative)
// lapTime = base*(1+offset) + degr1*age*(1 + tempCoeff*(temp-30)) + degr2*age^2 + freshBonus + pitPenalty
function totalTimeB(strat, rc, p) {
  let cur = strat.starting_tire, age = 0, t = 0;
  const stops = (strat.pit_stops || []).slice().sort((a,b) => a.lap - b.lap);
  let si = 0;
  for (let lap = 1; lap <= rc.total_laps; lap++) {
    age++;
    const ti = 'SMH'.indexOf(cur[0]);
    const tempMul = 1 + p[3+ti] * (rc.track_temp - 30);
    t += rc.base_lap_time * (1 + p[ti])
       + p[6+ti] * age * tempMul
       + p[9+ti] * age * age
       + (age === 1 ? p[12+ti] : 0)
       + (si > 0 && age === 1 ? p[15] : 0);
    if (si < stops.length && lap === stops[si].lap) {
      t += rc.pit_lane_time;
      cur = stops[si].to_tire;
      age = 0; si++;
    }
  }
  return t;
}

// Variant C: Temperature additive on degradation (not on base lap time)
// lapTime = base*(1+offset) + (degr1 + tempCoeff*(temp-30))*age + degr2*age^2 + freshBonus + pitPenalty
function totalTimeC(strat, rc, p) {
  let cur = strat.starting_tire, age = 0, t = 0;
  const stops = (strat.pit_stops || []).slice().sort((a,b) => a.lap - b.lap);
  let si = 0;
  for (let lap = 1; lap <= rc.total_laps; lap++) {
    age++;
    const ti = 'SMH'.indexOf(cur[0]);
    const effectiveDegr = p[6+ti] + p[3+ti] * (rc.track_temp - 30);
    t += rc.base_lap_time * (1 + p[ti])
       + effectiveDegr * age
       + p[9+ti] * age * age
       + (age === 1 ? p[12+ti] : 0)
       + (si > 0 && age === 1 ? p[15] : 0);
    if (si < stops.length && lap === stops[si].lap) {
      t += rc.pit_lane_time;
      cur = stops[si].to_tire;
      age = 0; si++;
    }
  }
  return t;
}

// Variant D: Temperature multiplicative on both degradation terms
// lapTime = base*(1+offset) + (degr1*age + degr2*age^2) * (1 + tempCoeff*(temp-30)) + freshBonus + pitPenalty
function totalTimeD(strat, rc, p) {
  let cur = strat.starting_tire, age = 0, t = 0;
  const stops = (strat.pit_stops || []).slice().sort((a,b) => a.lap - b.lap);
  let si = 0;
  for (let lap = 1; lap <= rc.total_laps; lap++) {
    age++;
    const ti = 'SMH'.indexOf(cur[0]);
    const tempMul = 1 + p[3+ti] * (rc.track_temp - 30);
    t += rc.base_lap_time * (1 + p[ti])
       + (p[6+ti] * age + p[9+ti] * age * age) * tempMul
       + (age === 1 ? p[12+ti] : 0)
       + (si > 0 && age === 1 ? p[15] : 0);
    if (si < stops.length && lap === stops[si].lap) {
      t += rc.pit_lane_time;
      cur = stops[si].to_tire;
      age = 0; si++;
    }
  }
  return t;
}

// ============================================================================
// SCORING
// ============================================================================

function simulateWithFn(race, params, timeFn) {
  const rc = race.race_config;
  const times = {};
  for (const strat of Object.values(race.strategies)) {
    times[strat.driver_id] = timeFn(strat, rc, params);
  }
  return Object.entries(times).sort((a,b) => a[1] - b[1]).map(e => e[0]);
}

function scoreExact(races, params, timeFn) {
  let correct = 0;
  for (const r of races) {
    const pred = simulateWithFn(r, params, timeFn);
    if (JSON.stringify(pred) === JSON.stringify(r.finishing_positions)) correct++;
  }
  return correct;
}

function scorePairwise(races, params, timeFn) {
  // Count the number of correctly ordered pairs across all races
  let totalCorrect = 0, totalPairs = 0;
  for (const r of races) {
    const rc = r.race_config;
    const times = {};
    for (const strat of Object.values(r.strategies)) {
      times[strat.driver_id] = timeFn(strat, rc, params);
    }
    const truth = r.finishing_positions;
    for (let i = 0; i < truth.length; i++) {
      for (let j = i + 1; j < truth.length; j++) {
        totalPairs++;
        if (times[truth[i]] < times[truth[j]]) totalCorrect++;
      }
    }
  }
  return totalCorrect / totalPairs;
}

// ============================================================================
// NELDER-MEAD OPTIMIZATION (Simplex Method)
// ============================================================================

function nelderMead(f, x0, { maxIter = 5000, tol = 1e-10, alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5 } = {}) {
  const n = x0.length;
  
  // Initialize simplex
  let simplex = [{ x: x0.slice(), fx: f(x0) }];
  for (let i = 0; i < n; i++) {
    const xi = x0.slice();
    xi[i] += (Math.abs(xi[i]) > 1e-8 ? xi[i] * 0.05 : 0.005);
    simplex.push({ x: xi, fx: f(xi) });
  }
  
  for (let iter = 0; iter < maxIter; iter++) {
    // Sort
    simplex.sort((a, b) => a.fx - b.fx);
    
    const best = simplex[0];
    const worst = simplex[n];
    const secondWorst = simplex[n - 1];
    
    // Convergence check
    if (iter % 100 === 0) {
      console.log(`  NM iter=${iter} best=${(-best.fx).toFixed(6)} worst=${(-worst.fx).toFixed(6)}`);
    }
    if (Math.abs(worst.fx - best.fx) < tol) break;
    
    // Centroid (excluding worst)
    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i].x[j];
    }
    for (let j = 0; j < n; j++) centroid[j] /= n;
    
    // Reflection
    const xr = centroid.map((c, j) => c + alpha * (c - worst.x[j]));
    const fr = f(xr);
    
    if (fr < secondWorst.fx && fr >= best.fx) {
      simplex[n] = { x: xr, fx: fr };
      continue;
    }
    
    // Expansion
    if (fr < best.fx) {
      const xe = centroid.map((c, j) => c + gamma * (xr[j] - c));
      const fe = f(xe);
      simplex[n] = fe < fr ? { x: xe, fx: fe } : { x: xr, fx: fr };
      continue;
    }
    
    // Contraction
    const xc = centroid.map((c, j) => c + rho * (worst.x[j] - c));
    const fc = f(xc);
    if (fc < worst.fx) {
      simplex[n] = { x: xc, fx: fc };
      continue;
    }
    
    // Shrink
    for (let i = 1; i <= n; i++) {
      for (let j = 0; j < n; j++) {
        simplex[i].x[j] = best.x[j] + sigma * (simplex[i].x[j] - best.x[j]);
      }
      simplex[i].fx = f(simplex[i].x);
    }
  }
  
  simplex.sort((a, b) => a.fx - b.fx);
  return simplex[0];
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log('=== FUNDAMENTAL F1 SIMULATOR ANALYSIS ===\n');
  console.log('Loading data...');
  const allRaces = loadRaces(5); // 5000 races
  const train = allRaces.slice(0, 3000);
  const val = allRaces.slice(3000, 5000);
  console.log(`Train: ${train.length}, Val: ${val.length}\n`);
  
  // Starting point from previously learned params
  const learned = JSON.parse(fs.readFileSync(path.join(__dirname, 'learned_params.json'), 'utf8'));
  const lp = learned.params;
  
  // Pack params into array: [offsetS, offsetM, offsetH, tempS, tempM, tempH, degr1S, degr1M, degr1H, degr2S, degr2M, degr2H, freshS, freshM, freshH, pitPenalty]
  const x0 = [
    lp.offset.SOFT, lp.offset.MEDIUM, lp.offset.HARD,
    lp.tempCoeff.SOFT, lp.tempCoeff.MEDIUM, lp.tempCoeff.HARD,
    lp.degr1.SOFT, lp.degr1.MEDIUM, lp.degr1.HARD,
    lp.degr2.SOFT, lp.degr2.MEDIUM, lp.degr2.HARD,
    lp.freshBonus.SOFT, lp.freshBonus.MEDIUM, lp.freshBonus.HARD,
    lp.pitExitPenalty,
  ];
  
  const variants = [
    { name: 'A: Additive temp', fn: totalTimeA },
    { name: 'B: Temp * linear degr', fn: totalTimeB },
    { name: 'C: Temp + linear degr', fn: totalTimeC },
    { name: 'D: Temp * all degr', fn: totalTimeD },
  ];
  
  // First, evaluate all variants with current best params
  console.log('--- Evaluating variants with current params ---');
  for (const v of variants) {
    const exact = scoreExact(train.slice(0, 500), x0, v.fn);
    const pw = scorePairwise(train.slice(0, 500), x0, v.fn);
    console.log(`${v.name}: exact=${exact}/500, pairwise=${(pw*100).toFixed(2)}%`);
  }
  
  // Now optimize each variant with Nelder-Mead
  console.log('\n--- Optimizing each variant with Nelder-Mead ---');
  const subset = train.slice(0, 1000); // Start with 1000 for speed
  
  let bestOverall = { score: 0, params: null, variant: null, fn: null };
  
  for (const v of variants) {
    console.log(`\nOptimizing: ${v.name}`);
    
    // Objective: minimize negative pairwise accuracy (since NM minimizes)
    const obj = (p) => -scorePairwise(subset, p, v.fn);
    
    const result = nelderMead(obj, x0.slice(), { maxIter: 3000 });
    const optParams = result.x;
    
    // Evaluate on training set
    const trainExact = scoreExact(train, optParams, v.fn);
    const trainPW = scorePairwise(train, optParams, v.fn);
    // Evaluate on validation set
    const valExact = scoreExact(val, optParams, v.fn);
    const valPW = scorePairwise(val, optParams, v.fn);
    
    console.log(`  Train: exact=${trainExact}/${train.length} (${(trainExact/train.length*100).toFixed(1)}%), pairwise=${(trainPW*100).toFixed(2)}%`);
    console.log(`  Val:   exact=${valExact}/${val.length} (${(valExact/val.length*100).toFixed(1)}%), pairwise=${(valPW*100).toFixed(2)}%`);
    
    if (valExact > bestOverall.score) {
      bestOverall = { score: valExact, params: optParams, variant: v.name, fn: v.fn };
    }
  }
  
  console.log('\n=== BEST VARIANT ===');
  console.log(`${bestOverall.variant} with ${bestOverall.score} exact matches on validation`);
  
  // Fine-tune the best variant on larger data
  console.log('\n--- Fine-tuning best variant on full training data ---');
  const obj2 = (p) => -scorePairwise(train, p, bestOverall.fn);
  const refined = nelderMead(obj2, bestOverall.params.slice(), { maxIter: 5000 });
  
  const finalParams = refined.x;
  const finalTrainExact = scoreExact(train, finalParams, bestOverall.fn);
  const finalValExact = scoreExact(val, finalParams, bestOverall.fn);
  console.log(`Final Train: exact=${finalTrainExact}/${train.length} (${(finalTrainExact/train.length*100).toFixed(1)}%)`);
  console.log(`Final Val:   exact=${finalValExact}/${val.length} (${(finalValExact/val.length*100).toFixed(1)}%)`);
  
  // Save results
  const result = {
    variant: bestOverall.variant,
    params: {
      offset: { SOFT: finalParams[0], MEDIUM: finalParams[1], HARD: finalParams[2] },
      tempCoeff: { SOFT: finalParams[3], MEDIUM: finalParams[4], HARD: finalParams[5] },
      degr1: { SOFT: finalParams[6], MEDIUM: finalParams[7], HARD: finalParams[8] },
      degr2: { SOFT: finalParams[9], MEDIUM: finalParams[10], HARD: finalParams[11] },
      freshBonus: { SOFT: finalParams[12], MEDIUM: finalParams[13], HARD: finalParams[14] },
      pitExitPenalty: finalParams[15],
    },
    trainExact: finalTrainExact,
    valExact: finalValExact,
    trainTotal: train.length,
    valTotal: val.length,
  };
  
  fs.writeFileSync(path.join(__dirname, 'analysis_result.json'), JSON.stringify(result, null, 2));
  console.log('\nSaved to solution/analysis_result.json');
}

main();
