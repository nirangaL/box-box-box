const fs=require('fs');
let exactMatches = 0;
let avgSwaps = 0;
for(let i=1; i<=100; i++) {
  const d = JSON.parse(fs.readFileSync('data/test_cases/inputs/test_'+String(i).padStart(3,'0')+'.json','utf8'));
  const e = JSON.parse(fs.readFileSync('data/test_cases/expected_outputs/test_'+String(i).padStart(3,'0')+'.json','utf8')).finishing_positions;
  let swaps = 0;
  for(let j=0; j<20; j++) {
     const gid = d.strategies['pos'+(j+1)].driver_id;
     if(gid !== e[j]) swaps++;
  }
  if(swaps===0) exactMatches++;
  avgSwaps += swaps;
}
console.log('Avg Displacements from Grid:', avgSwaps/100, 'Races exactly match grid:', exactMatches);
