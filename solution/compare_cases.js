const fs = require('fs');
const path = require('path');

function getRaceInfo(id) {
    const input = JSON.parse(fs.readFileSync(`data/test_cases/inputs/test_${id}.json`, 'utf8'));
    const expected = JSON.parse(fs.readFileSync(`data/test_cases/expected_outputs/test_${id}.json`, 'utf8')).finishing_positions;
    return {
        id,
        track: input.race_config.track,
        temp: input.race_config.track_temp,
        laps: input.race_config.total_laps,
        base: input.race_config.base_lap_time,
        numStrategies: Object.keys(input.strategies).length,
        compounds: [...new Set(Object.values(input.strategies).map(s => s.starting_tire))]
    };
}

console.log('--- TEST_005 (PASS) ---');
console.log(getRaceInfo('005'));
console.log('\n--- TEST_006 (FAIL) ---');
console.log(getRaceInfo('006'));
