const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data/historical_races';
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

const stats = {};
for (let i = 1; i <= 20; i++) stats[`D${String(i).padStart(3, '0')}`] = { total: 0, count: 0 };

for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    for (const r of data) {
        r.finishing_positions.forEach((id, rank) => {
            if (stats[id]) {
                stats[id].total += (rank + 1);
                stats[id].count++;
            }
        });
    }
}

const final = Object.keys(stats).map(id => ({
    id,
    avg: stats[id].total / stats[id].count
})).sort((a,b) => a.avg - b.avg);

console.log('Driver ID Skill Ranking (Historical Average):');
final.forEach((s, i) => console.log(`${i+1}. ${s.id}: ${s.avg.toFixed(2)}`));
