const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data/historical_races';
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

const trackAnalysis = {};

for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    for (const r of data) {
        const rc = r.race_config;
        if (!trackAnalysis[rc.track]) trackAnalysis[rc.track] = {};
        if (!trackAnalysis[rc.track][rc.total_laps]) trackAnalysis[rc.track][rc.total_laps] = [];
        trackAnalysis[rc.track][rc.total_laps].push(rc.base_lap_time);
    }
}

for (const track in trackAnalysis) {
    const laps = Object.keys(trackAnalysis[track]).sort((a,b) => a-b);
    if (laps.length > 1) {
        console.log(`Track: ${track}`);
        for (const L of laps) {
            const avg = trackAnalysis[track][L].reduce((a,b)=>a+b,0) / trackAnalysis[track][L].length;
            console.log(`  Laps ${L}: Avg Base ${avg.toFixed(2)}`);
        }
        // Calculate Slope
        const L1 = parseInt(laps[0]);
        const L2 = parseInt(laps[laps.length-1]);
        const B1 = trackAnalysis[track][L1].reduce((a,b)=>a+b,0) / trackAnalysis[track][L1].length;
        const B2 = trackAnalysis[track][L2].reduce((a,b)=>a+b,0) / trackAnalysis[track][L2].length;
        const slope = (B2 - B1) / (L2 - L1);
        console.log(`  Fuel Weight Slope: ${slope.toFixed(4)} s/lap`);
    }
}
