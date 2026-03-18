/**
 * DATA ANALYSIS: Understand the exact formula from the data
 * 
 * Strategy:
 * 1. Find races where two drivers differ by ONLY ONE variable
 *    (e.g., same tires but different pit stop laps)
 * 2. Extract constraints on individual parameters
 * 3. Use these constraints to narrow the search space
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

function strategySignature(strat) {
  const stops = (strat.pit_stops || []).slice().sort((a, b) => a.lap - b.lap);
  return strat.starting_tire + '|' + stops.map(s => `${s.lap}:${s.to_tire}`).join(',');
}

function main() {
  console.log('Loading data...');
  const races = loadRaces(3);
  console.log(`Loaded ${races.length} races\n`);

  // 1. How many distinct tire sequences exist?
  const seqCounts = {};
  for (const r of races) {
    for (const strat of Object.values(r.strategies)) {
      const sig = strategySignature(strat);
      const tireSeq = strat.starting_tire + '->' + (strat.pit_stops || []).map(s => s.to_tire).join('->');
      seqCounts[tireSeq] = (seqCounts[tireSeq] || 0) + 1;
    }
  }
  console.log('=== Tire Sequences ===');
  const sorted = Object.entries(seqCounts).sort((a, b) => b[1] - a[1]);
  for (const [seq, count] of sorted.slice(0, 20)) {
    console.log(`  ${seq}: ${count}`);
  }
  
  // 2. Find pairs of drivers in the same race with identical tire sequences
  // but different pit stop laps
  console.log('\n=== Identical tire sequences, different pit timing ===');
  let pairCount = 0;
  for (const r of races.slice(0, 500)) {
    const strats = Object.values(r.strategies);
    for (let i = 0; i < strats.length; i++) {
      for (let j = i + 1; j < strats.length; j++) {
        const si = strats[i], sj = strats[j];
        const tireSeqI = si.starting_tire + '->' + (si.pit_stops || []).map(s => s.to_tire).join('->');
        const tireSeqJ = sj.starting_tire + '->' + (sj.pit_stops || []).map(s => s.to_tire).join('->');
        if (tireSeqI === tireSeqJ && strategySignature(si) !== strategySignature(sj)) {
          // Same tire sequence, different timing
          const posI = r.finishing_positions.indexOf(si.driver_id);
          const posJ = r.finishing_positions.indexOf(sj.driver_id);
          if (pairCount < 5) {
            console.log(`  Race ${r.race_id}: ${si.driver_id}(P${posI+1}) vs ${sj.driver_id}(P${posJ+1})`);
            console.log(`    ${si.driver_id}: ${strategySignature(si)}`);
            console.log(`    ${sj.driver_id}: ${strategySignature(sj)}`);
          }
          pairCount++;
        }
      }
    }
  }
  console.log(`  Total such pairs in first 500 races: ${pairCount}`);

  // 3. Temperature distribution
  const temps = races.map(r => r.race_config.track_temp);
  console.log(`\n=== Temperature range: ${Math.min(...temps)} - ${Math.max(...temps)} ===`);
  
  // 4. Check: do all races use reference temp 30? 
  const tempCounts = {};
  for (const t of temps) tempCounts[t] = (tempCounts[t] || 0) + 1;
  console.log('Temperature distribution:');
  for (const [t, c] of Object.entries(tempCounts).sort((a,b) => +a[0] - +b[0])) {
    console.log(`  ${t}°C: ${c} races`);
  }

  // 5. Look at laps and pit stops
  const lapCounts = {};
  for (const r of races) {
    lapCounts[r.race_config.total_laps] = (lapCounts[r.race_config.total_laps] || 0) + 1;
  }
  console.log('\n=== Laps distribution ===');
  for (const [l, c] of Object.entries(lapCounts).sort((a,b) => +a[0] - +b[0])) {
    console.log(`  ${l} laps: ${c} races`);
  }

  // 6. Count number of pit stops per driver
  const stopCounts = {};
  for (const r of races) {
    for (const strat of Object.values(r.strategies)) {
      const n = (strat.pit_stops || []).length;
      stopCounts[n] = (stopCounts[n] || 0) + 1;
    }
  }
  console.log('\n=== Pit stop counts ===');
  for (const [n, c] of Object.entries(stopCounts).sort((a,b) => +a[0] - +b[0])) {
    console.log(`  ${n} stops: ${c} drivers`);
  }

  // 7. Most importantly: test which formula variant gets the best results
  // by carefully examining races where we KNOW the answer
  console.log('\n=== Testing formula variants with current best params ===');
  const learned = JSON.parse(fs.readFileSync(path.join(__dirname, 'learned_params.json'), 'utf8')).params;
  
  // Test a few formulas and see which gets most exact matches
  const variants = {
    'A: additive temp': (strat, rc, p) => {
      let cur = strat.starting_tire, age = 0, t = 0;
      const stops = (strat.pit_stops || []).slice().sort((a,b) => a.lap - b.lap);
      let si = 0;
      for (let lap = 1; lap <= rc.total_laps; lap++) {
        age++;
        t += rc.base_lap_time * (1 + p.offset[cur])
          + p.tempCoeff[cur] * (rc.track_temp - 30)
          + p.degr1[cur] * age + p.degr2[cur] * age * age
          + (age === 1 ? p.freshBonus[cur] : 0)
          + (si > 0 && age === 1 ? p.pitExitPenalty : 0);
        if (si < stops.length && lap === stops[si].lap) {
          t += rc.pit_lane_time; cur = stops[si].to_tire; age = 0; si++;
        }
      }
      return t;
    },
    'D: temp * all degr': (strat, rc, p) => {
      let cur = strat.starting_tire, age = 0, t = 0;
      const stops = (strat.pit_stops || []).slice().sort((a,b) => a.lap - b.lap);
      let si = 0;
      for (let lap = 1; lap <= rc.total_laps; lap++) {
        age++;
        const tm = 1 + p.tempCoeff[cur] * (rc.track_temp - 30);
        t += rc.base_lap_time * (1 + p.offset[cur])
          + (p.degr1[cur] * age + p.degr2[cur] * age * age) * tm
          + (age === 1 ? p.freshBonus[cur] : 0)
          + (si > 0 && age === 1 ? p.pitExitPenalty : 0);
        if (si < stops.length && lap === stops[si].lap) {
          t += rc.pit_lane_time; cur = stops[si].to_tire; age = 0; si++;
        }
      }
      return t;
    },
  };

  for (const [name, timeFn] of Object.entries(variants)) {
    let correct = 0;
    for (const r of races) {
      const times = {};
      for (const strat of Object.values(r.strategies)) {
        times[strat.driver_id] = timeFn(strat, r.race_config, learned);
      }
      const pred = Object.entries(times).sort((a,b) => a[1] - b[1]).map(e => e[0]);
      if (JSON.stringify(pred) === JSON.stringify(r.finishing_positions)) correct++;
    }
    console.log(`  ${name}: ${correct}/${races.length} exact (${(correct/races.length*100).toFixed(1)}%)`);
  }
}

main();
