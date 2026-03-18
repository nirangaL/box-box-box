const fs = require('fs');
const path = require('path');
const { simulate } = require('./race_simulator.js');

const inputDir = 'data/test_cases/inputs';
const outputDir = 'data/test_cases/expected_outputs';

const fails = [], passes = [];
for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, '0');
    const input = JSON.parse(fs.readFileSync(path.join(inputDir, `test_${id}.json`), 'utf8'));
    const expected = JSON.parse(fs.readFileSync(path.join(outputDir, `test_${id}.json`), 'utf8'));
    const pred = simulate(input);
    const passed = JSON.stringify(pred) === JSON.stringify(expected.finishing_positions);

    const rc = input.race_config;
    // Count 1-stop vs 2-stop drivers
    let stops1 = 0, stops2 = 0;
    for (let j = 1; j <= 20; j++) {
        const s = input.strategies[`pos${j}`];
        const n = (s.pit_stops || []).length;
        if (n === 1) stops1++;
        else if (n === 2) stops2++;
    }
    const info = { id: i, track: rc.track, laps: rc.total_laps, temp: rc.track_temp, stops1, stops2, passed };
    (passed ? passes : fails).push(info);
}

console.log('\n=== FAILING TESTS ANALYSIS ===');
const byTrack = {};
for (const f of fails) {
    if (!byTrack[f.track]) byTrack[f.track] = {count: 0, temps: [], laps: []};
    byTrack[f.track].count++;
    byTrack[f.track].temps.push(f.temp);
    byTrack[f.track].laps.push(f.laps);
}
for (const [track, d] of Object.entries(byTrack)) {
    const avgTemp = (d.temps.reduce((a,b)=>a+b,0)/d.temps.length).toFixed(1);
    const avgLaps = (d.laps.reduce((a,b)=>a+b,0)/d.laps.length).toFixed(1);
    console.log(`${track.padEnd(12)}: ${d.count} fails | AvgTemp=${avgTemp} AvgLaps=${avgLaps}`);
}

console.log('\n=== TEMP DISTRIBUTION OF FAILURES ===');
const tempBuckets = {};
for (const f of fails) {
    const tb = Math.floor(f.temp / 5) * 5;
    if (!tempBuckets[tb]) tempBuckets[tb] = { fail: 0, pass: 0 };
    tempBuckets[tb].fail++;
}
for (const f of passes) {
    const tb = Math.floor(f.temp / 5) * 5;
    if (!tempBuckets[tb]) tempBuckets[tb] = { fail: 0, pass: 0 };
    tempBuckets[tb].pass++;
}
for (const [bucket, d] of Object.entries(tempBuckets).sort((a,b)=>+a[0]-+b[0])) {
    const total = d.fail + d.pass;
    console.log(`Temp ${bucket}-${+bucket+4}: ${d.pass}/${total} pass (${(d.pass/total*100).toFixed(0)}%)`);
}

console.log('\n=== LAPS DISTRIBUTION OF FAILURES ===');
const lapBuckets = {};
for (const f of fails) {
    const lb = Math.floor(f.laps / 10) * 10;
    if (!lapBuckets[lb]) lapBuckets[lb] = { fail: 0, pass: 0 };
    lapBuckets[lb].fail++;
}
for (const f of passes) {
    const lb = Math.floor(f.laps / 10) * 10;
    if (!lapBuckets[lb]) lapBuckets[lb] = { fail: 0, pass: 0 };
    lapBuckets[lb].pass++;
}
for (const [bucket, d] of Object.entries(lapBuckets).sort((a,b)=>+a[0]-+b[0])) {
    const total = d.fail + d.pass;
    console.log(`Laps ${bucket}-${+bucket+9}: ${d.pass}/${total} pass (${(d.pass/total*100).toFixed(0)}%)`);
}

console.log('\n=== STOPS COUNTS IN FAILURES ===');
const avgFail1 = (fails.reduce((a,b)=>a+b.stops1,0)/fails.length).toFixed(1);
const avgFail2 = (fails.reduce((a,b)=>a+b.stops2,0)/fails.length).toFixed(1);
const avgPass1 = (passes.reduce((a,b)=>a+b.stops1,0)/passes.length).toFixed(1);
const avgPass2 = (passes.reduce((a,b)=>a+b.stops2,0)/passes.length).toFixed(1);
console.log(`Failing: avg 1-stop drivers=${avgFail1}, avg 2-stop drivers=${avgFail2}`);
console.log(`Passing: avg 1-stop drivers=${avgPass1}, avg 2-stop drivers=${avgPass2}`);
