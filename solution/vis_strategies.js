const fs = require('fs');
const d = JSON.parse(fs.readFileSync('data/historical_races/races_00000-00999.json', 'utf8'));

let softMax = 0;
let medMax = 0;
let hardMax = 0;

for (const r of d) {
    if (r.race_config.track_temp !== 28) continue; // hold temp constant to see pattern
    
    // For each winner, how many laps did they do on each tire?
    for (let pos = 1; pos <= 20; pos++) {
        const id = r.finishing_positions[pos-1];
        const s = Object.values(r.strategies).find(x => x.driver_id === id);
        
        let laps = 0;
        let tire = s.starting_tire;
        if (s.pit_stops && s.pit_stops.length > 0) {
            laps = s.pit_stops[0].lap;
        } else {
            laps = r.race_config.total_laps;
        }
        
        if (pos === 1) {
            if (tire === 'SOFT' && laps > softMax) softMax = laps;
            if (tire === 'MEDIUM' && laps > medMax) medMax = laps;
            if (tire === 'HARD' && laps > hardMax) hardMax = laps;
        }
    }
}
console.log(`Max Winner Stint at Temp 28 -> SOFT: ${softMax}, MEDIUM: ${medMax}, HARD: ${hardMax}`);
