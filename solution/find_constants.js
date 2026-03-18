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

function main() {
  const races = loadRaces(10); // 10,000 drivers is enough
  console.log(`Loaded ${races.length} races.`);

  // We want to find cases where temp is 30 (normalized)
  const t30Races = races.filter(r => r.race_config.track_temp === 30);
  console.log(`Found ${t30Races.length} races at 30°C.`);

  // Track Compound differences
  // If we have many drivers at 30°C with different strategies, 
  // we can treat total time as:
  // Time = Laps * Base*(1+Offset) + sum(d1*age + d2*age^2) + nStops*PitPenalty + ...
  
  // Actually, let's use a simpler observation:
  // If Driver A and Driver B differ in their finishing position, 
  // their Time A must be < Time B.
  
  // I will write an evaluator that tries thousands of combinations of 
  // small discrete values for the main parameters.
  // offsets: -0.05 to 0.05 step 0.001
  // d1: 0 to 0.2 step 0.01
  // d2: 0 to 0.01 step 0.001
  
  // But wait! If I'm "thinking smart", I should check if the constants are ROUND numbers.
  // offset: maybe -0.01, -0.02, 0, 0.01, 0.02
  // d1: maybe 0.1, 0.05, 0.02
  // d2: maybe 0.002, 0.001, 0.0005
  
  // Let's check!
}

main();
