const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data/historical_races';
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

let total = 0;
let gridWins = 0;
let gridTop3 = 0;

const trackStats = {};

for (const f of files) {
    const races = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    for (const r of races) {
        total++;
        const p1_id = r.strategies.pos1.driver_id;
        const winner = r.finishing_positions[0];
        
        const track = r.race_config.track;
        if (!trackStats[track]) trackStats[track] = { total: 0, p1Wins: 0, p2Wins: 0, p3Wins: 0 };
        trackStats[track].total++;
        
        if (p1_id === winner) {
            gridWins++;
            trackStats[track].p1Wins++;
        }
        
        const top3_ids = r.finishing_positions.slice(0, 3);
        if (top3_ids.includes(p1_id)) gridTop3++;
        
        const p2_id = r.strategies.pos2.driver_id;
        if (p2_id === winner) trackStats[track].p2Wins++;

        const p3_id = r.strategies.pos3.driver_id;
        if (p3_id === winner) trackStats[track].p3Wins++;
    }
}

console.log(`Total Races: ${total}`);
console.log(`P1 Wins: ${gridWins} (${(gridWins/total*100).toFixed(1)}%)`);
console.log(`P1 Podium: ${gridTop3} (${(gridTop3/total*100).toFixed(1)}%)`);

console.log('\nTrack | P1 Win % | P2 Win % | P3 Win %');
console.log('---------------------------------------');
for (const t in trackStats) {
    const s = trackStats[t];
    console.log(`${t.padEnd(12)} | ${(s.p1Wins/s.total*100).toFixed(1)}% | ${(s.p2Wins/s.total*100).toFixed(1)}% | ${(s.p3Wins/s.total*100).toFixed(1)}%`);
}
