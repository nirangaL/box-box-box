/**
 * ALGEBRAIC PARAMETER EXTRACTION
 * 
 * Strategy: Find pairs of drivers in the same race where:
 * 1. Same number of stops
 * 2. Same tire compounds in same order  
 * 3. Only pit stop TIMING differs
 * 
 * From these pairs, the time difference ONLY depends on degradation.
 * This lets us extract degradation parameters directly.
 * 
 * Also, find pairs with:
 * - Same everything but different starting compound -> extract offsets
 * - Same but different temperatures (across races) -> extract tempCoeff
 */
const fs = require('fs');
const path = require('path');

const histDir = path.join(__dirname, '..', 'data', 'historical_races');

// Load a good sample
let races = [];
for (let b = 0; b < 3; b++) {
    const start = String(b * 1000).padStart(5, '0');
    const end = String(b * 1000 + 999).padStart(5, '0');
    races.push(...JSON.parse(fs.readFileSync(path.join(histDir, `races_${start}-${end}.json`), 'utf8')));
}
console.log(`Loaded ${races.length} races`);

const out = [];
const log = (...args) => out.push(args.join(' '));

// For each driver, compute a "strategy fingerprint"
function fingerprint(strat) {
    const stops = (strat.pit_stops || []);
    const tireSeq = strat.starting_tire.toUpperCase();
    const tires = tireSeq + stops.map(s => '->' + s.to_tire.toUpperCase()).join('');
    return tires;
}

// Find "minimal difference" pairs
let timingDiffPairs = [];  // Same tires, different lap timings

for (const race of races) {
    const strats = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        strats.push({
            driver: s.driver_id,
            grid: i,
            startTire: s.starting_tire.toUpperCase(),
            stops: (s.pit_stops || []).map(p => ({
                lap: p.lap,
                from: p.from_tire.toUpperCase(),
                to: p.to_tire.toUpperCase()
            })),
            fp: fingerprint(s)
        });
    }
    
    // Find finishing positions
    const finPos = {};
    race.finishing_positions.forEach((d, i) => finPos[d] = i);
    
    // Compare all pairs
    for (let i = 0; i < 20; i++) {
        for (let j = i + 1; j < 20; j++) {
            const a = strats[i], b = strats[j];
            
            if (a.fp === b.fp && a.stops.length === b.stops.length) {
                // Same tire sequence, find which lap timings differ
                const lapDiffs = [];
                for (let k = 0; k < a.stops.length; k++) {
                    if (a.stops[k].lap !== b.stops[k].lap) {
                        lapDiffs.push({
                            stopIdx: k,
                            lapA: a.stops[k].lap,
                            lapB: b.stops[k].lap
                        });
                    }
                }
                
                if (lapDiffs.length >= 1) {
                    const winner = finPos[a.driver] < finPos[b.driver] ? a : b;
                    const loser = winner === a ? b : a;
                    
                    timingDiffPairs.push({
                        raceId: race.race_id,
                        config: race.race_config,
                        winner: { ...winner, finPos: finPos[winner.driver] + 1 },
                        loser: { ...loser, finPos: finPos[loser.driver] + 1 },
                        tireSeq: a.fp,
                        lapDiffs
                    });
                }
            }
        }
    }
}

log(`Found ${timingDiffPairs.length} timing-diff pairs`);

// Analyze: In pairs with only 1 stop timing diff, which pit timing wins?
const singleDiffPairs = timingDiffPairs.filter(p => p.lapDiffs.length === 1);
log(`\nPairs with exactly 1 stop timing difference: ${singleDiffPairs.length}`);

// For one-stop strategies, analyze whether earlier or later pit is better
const oneStopSingleDiff = singleDiffPairs.filter(p => p.winner.stops.length === 1);
log(`\nOne-stop, single timing diff pairs: ${oneStopSingleDiff.length}`);

// Group by tire sequence and temperature
const byTireTemp = {};
for (const pair of oneStopSingleDiff) {
    const key = `${pair.tireSeq}_T${pair.config.track_temp}`;
    if (!byTireTemp[key]) byTireTemp[key] = [];
    byTireTemp[key].push(pair);
}

// For each group, check if earlier or later pit consistently wins
log('\nBy tire sequence + temperature:');
for (const [key, pairs] of Object.entries(byTireTemp).sort((a,b) => b[1].length - a[1].length).slice(0, 20)) {
    let earlierWins = 0, laterWins = 0;
    for (const p of pairs) {
        const diff = p.lapDiffs[0];
        const winnerLap = p.winner.stops[diff.stopIdx].lap;
        const loserLap = p.loser.stops[diff.stopIdx].lap;
        if (winnerLap < loserLap) earlierWins++;
        else laterWins++;
    }
    log(`  ${key}: ${pairs.length} pairs, earlier wins: ${earlierWins}, later wins: ${laterWins}`);
}

// More importantly: Extract EXACT relationship between pit lap and outcome
// For MEDIUM->HARD one-stop races at temp 30, what's the optimal pit window?
log('\n\n=== MEDIUM->HARD one-stop at specific temps ===');
const mhPairs = oneStopSingleDiff.filter(p => p.tireSeq === 'MEDIUM->HARD');
log(`Total MEDIUM->HARD pairs: ${mhPairs.length}`);

// For each pair, the winner had the better pit timing.
// Map: winnerPitLap, loserPitLap, totalLaps, baseLap, temp
for (const p of mhPairs.slice(0, 10)) {
    const diff = p.lapDiffs[0];
    const wLap = p.winner.stops[diff.stopIdx].lap;
    const lLap = p.loser.stops[diff.stopIdx].lap;
    log(`  ${p.raceId}: winner pit L${wLap}, loser pit L${lLap} (${p.config.total_laps} laps, base=${p.config.base_lap_time}, temp=${p.config.track_temp})`);
}

// Now find pairs where ONLY the starting tire is different (everything else same)
log('\n\n=== Different starting tire, same everything else ===');
let tireSwapPairs = [];
for (const race of races) {
    const strats = [];
    for (let i = 1; i <= 20; i++) {
        const s = race.strategies[`pos${i}`];
        strats.push({
            driver: s.driver_id,
            grid: i,
            startTire: s.starting_tire.toUpperCase(),
            stops: (s.pit_stops || []).map(p => ({
                lap: p.lap,
                to: p.to_tire.toUpperCase()
            }))
        });
    }
    
    const finPos = {};
    race.finishing_positions.forEach((d, i) => finPos[d] = i);
    
    for (let i = 0; i < 20; i++) {
        for (let j = i + 1; j < 20; j++) {
            const a = strats[i], b = strats[j];
            if (a.startTire !== b.startTire && 
                a.stops.length === b.stops.length &&
                JSON.stringify(a.stops) === JSON.stringify(b.stops)) {
                // Same stops, different starting tire!
                const winner = finPos[a.driver] < finPos[b.driver] ? a : b;
                const loser = winner === a ? b : a;
                tireSwapPairs.push({
                    raceId: race.race_id,
                    config: race.race_config,
                    winnerTire: winner.startTire,
                    loserTire: loser.startTire,
                    stops: winner.stops,
                    finPosDiff: finPos[loser.driver] - finPos[winner.driver]
                });
            }
        }
    }
}

log(`\nFound ${tireSwapPairs.length} tire-swap pairs (same stops, different starting tire)`);

// Analyze which tire tends to win
const tireMatchups = {};
for (const p of tireSwapPairs) {
    const key = `${p.winnerTire} beats ${p.loserTire}`;
    tireMatchups[key] = (tireMatchups[key] || 0) + 1;
}
for (const [k, v] of Object.entries(tireMatchups).sort((a,b) => b[1] - a[1])) {
    log(`  ${k}: ${v} times`);
}

// Write results
const outPath = path.join(__dirname, 'algebraic_analysis.txt');
fs.writeFileSync(outPath, out.join('\n'));
console.log(`Results written to ${outPath}`);
console.log(out.slice(0, 30).join('\n'));
