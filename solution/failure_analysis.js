const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator.js');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_cases');

function main() {
  const failures = [];
  let passed = 0;

  for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'inputs', `test_${id}.json`), 'utf8'));
    const expected = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'expected_outputs', `test_${id}.json`), 'utf8'));
    
    const pred = simulate(input);
    if (JSON.stringify(pred) === JSON.stringify(expected.finishing_positions)) {
      passed++;
    } else {
      failures.push({
        id: `test_${id}`,
        track: input.race_config.track,
        temp: input.race_config.track_temp,
        base: input.race_config.base_lap_time,
        laps: input.race_config.total_laps
      });
    }
  }

  const trackFailures = {};
  const tempFailures = {};
  const tracksMatched = {};
  
  failures.forEach(f => {
    trackFailures[f.track] = (trackFailures[f.track] || 0) + 1;
    tempFailures[f.temp] = (tempFailures[f.temp] || 0) + 1;
  });

  console.log(JSON.stringify({
    summary: `${passed}/100 passed`,
    trackFailures,
    tempFailures
  }, null, 2));
}

main();
