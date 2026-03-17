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

// Score = exact, with pairwise tiebreaker
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

// NELDER-MEAD implementation
function nelderMead(races, p0) {
    const n = p0.length;
    let simplex = [p0.slice()];
    for (let i = 0; i < n; i++) {
        let p = p0.slice();
        p[i] += (p[i] === 0 ? 0.001 : p[i] * 0.05);
        simplex.push(p);
    }
    
    let scores = simplex.map(p => score(races, p));
    
    for (let iter = 0; iter < 500; iter++) {
        // Sort
        let indices = scores.map((s,i)=>[s,i]).sort((a,b)=>b[0]-a[0]).map(x=>x[1]);
        simplex = indices.map(i => simplex[i]);
        scores = indices.map(i => scores[i]);
        
        console.log(`NM Iter ${iter}: Best=${Math.floor(scores[0]/1000)}/2000`);
        
        // Centroid of all but worst
        let centroid = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n;
        }
        
        // Reflection
        let reflected = centroid.map((v, j) => 2 * v - simplex[n][j]);
        let rScore = score(races, reflected);
        
        if (rScore > scores[0]) {
            // Expansion
            let expanded = centroid.map((v, j) => 3 * v - 2 * simplex[n][j]);
            let eScore = score(races, expanded);
            if (eScore > rScore) {
                simplex[n] = expanded; scores[n] = eScore;
            } else {
                simplex[n] = reflected; scores[n] = rScore;
            }
        } else if (rScore > scores[n-1]) {
            simplex[n] = reflected; scores[n] = rScore;
        } else {
            // Contraction
            let contracted = centroid.map((v, j) => 0.5 * (v + simplex[n][j]));
            let cScore = score(races, contracted);
            if (cScore > scores[n]) {
                simplex[n] = contracted; scores[n] = cScore;
            } else {
                // Shrink
                for (let i = 1; i <= n; i++) {
                    simplex[i] = simplex[0].map((v, j) => 0.5 * (v + simplex[i][j]));
                    scores[i] = score(races, simplex[i]);
                }
            }
        }
        
        if (iter % 10 === 0) save(simplex[0], scores[0]);
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

function main() {
  const races = loadRaces(2);
  const learned = JSON.parse(fs.readFileSync('solution/learned_params.json', 'utf8')).params;
  const p0 = [
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
  nelderMead(races, p0);
}

main();
