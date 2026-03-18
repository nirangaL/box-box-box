const fs = require('fs');

for (let i = 1; i <= 100; i++) {
   const d = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_' + String(i).padStart(3, '0') + '.json', 'utf8'));
   
   for (let k in d) {
      if (k !== 'race_id' && k !== 'race_config' && k !== 'strategies') {
         console.log('HIDDEN KEY FOUND IN TEST ' + i + ':', k);
      }
   }
   
   for (let k in d.race_config) {
      if (!['track', 'total_laps', 'base_lap_time', 'pit_lane_time', 'track_temp'].includes(k)) {
          console.log('HIDDEN RACE CONFIG IN TEST ' + i + ':', k);
      }
   }
   
   for (let pos in d.strategies) {
      const s = d.strategies[pos];
      for (let k in s) {
         if (!['driver_id', 'starting_tire', 'pit_stops'].includes(k)) {
             console.log('HIDDEN STRATEGY KEY IN TEST ' + i + ' FOR POS ' + pos + ':', k);
         }
      }
   }
}
console.log('Hidden Data Scan Complete.');
