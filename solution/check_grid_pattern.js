const fs = require('fs');
const path = require('path');

function getGridOrder(id) {
    const input = JSON.parse(fs.readFileSync(`data/test_cases/inputs/test_${id}.json`, 'utf8'));
    const expected = JSON.parse(fs.readFileSync(`data/test_cases/expected_outputs/test_${id}.json`, 'utf8')).finishing_positions;
    
    // Map driver_id -> original grid pos
    const idToGrid = {};
    for (let i = 1; i <= 20; i++) {
        idToGrid[input.strategies[`pos${i}`].driver_id] = i;
    }
    
    return expected.map(id => idToGrid[id]);
}

console.log('TEST_001 Grid Pattern:', getGridOrder('001').join(', '));
console.log('TEST_002 Grid Pattern:', getGridOrder('002').join(', '));
console.log('TEST_003 Grid Pattern:', getGridOrder('003').join(', '));
console.log('TEST_004 Grid Pattern:', getGridOrder('004').join(', '));
console.log('TEST_005 Grid Pattern:', getGridOrder('005').join(', '));
