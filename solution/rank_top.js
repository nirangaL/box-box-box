const fs = require('fs');
const path = require('path');

const files = fs.readdirSync('solution').filter(f => f.startsWith('learned_params') && f.endsWith('.json'));
let bestFile = null;
let bestS = -1;

for (const f of files) {
    try {
        const data = JSON.parse(fs.readFileSync(path.join('solution', f), 'utf8'));
        const s = data.score || 0;
        if (s > bestS) {
            bestS = s;
            bestFile = f;
        }
    } catch(e) {}
}

if (bestFile) {
    console.log(`Top Score: ${Math.floor(bestS/1e6)}/100 (Pairs=${bestS%1e6}) from ${bestFile}`);
    const top = JSON.parse(fs.readFileSync(path.join('solution', bestFile), 'utf8'));
    fs.writeFileSync('solution/learned_params.json', JSON.stringify(top, null, 2));
    console.log('Updated learned_params.json');
} else {
    console.log('No learned params found');
}
