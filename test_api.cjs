const https = require('https');

function testUrl(url, name) {
  https.get(url, (res) => {
    console.log(`${name}: ${res.statusCode}`);
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`${name} data length: ${data.length}`);
    });
  }).on('error', (err) => {
    console.log(`${name} error: ${err.message}`);
  });
}

testUrl('https://data-api.binance.vision/api/v3/klines?symbol=EURUSDT&interval=1m&limit=100', 'EURUSDT');
testUrl('https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval=1m&limit=100', 'PAXGUSDT');
testUrl('https://data-api.binance.vision/api/v3/klines?symbol=GBPUSDT&interval=1m&limit=100', 'GBPUSDT');
