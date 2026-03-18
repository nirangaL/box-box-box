const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'historical_races');
const races = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'races_00000-00999.json'), 'utf8'));

const bt_target = 85.5;
const t_races = races.filter(r => Math.abs(r.race_config.base_lap_time - bt_target) < 0.1);

console.log(`Track 85.5 Wins:`);
for (const r of t_races) {
    const winnerId = r.finishing_positions[0];
    const winnerStrat = Object.values(r.strategies).find(s => s.driver_id === winnerId);
    console.log(`Temp: ${r.race_config.track_temp} Winner: ${winnerId} Start: ${winnerStrat.starting_tire} Pits: ${winnerStrat.pit_stops.length}`);
}
