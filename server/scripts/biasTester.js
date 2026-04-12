require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { runBiasTest } = require('../modules/biasTester');

runBiasTest()
  .then(results => {
    const fs = require('fs');
    const out = require('path').join(__dirname, '..', '..', 'data', 'bias_test_results.json');
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
    console.log(`Results saved to: ${out}`);
    process.exit(0);
  })
  .catch(err => { console.error('Bias test failed:', err); process.exit(1); });
