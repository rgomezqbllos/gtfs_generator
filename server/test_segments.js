import http from 'http';

const fetchJSON = (url) => new Promise((resolve, reject) => {
    http.get(url, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(JSON.parse(data)));
        res.on('error', reject);
    }).on('error', reject);
});

async function check() {
    const segments = await fetchJSON('http://localhost:3001/api/segments');
    console.log("Total segments:", segments.length);
    const zeroes = segments.filter(s => s.travel_time === 0 || s.travel_time === "0" || s.travel_time < 0);
    console.log("Zero/negative travel_time segments:", zeroes.length);
    if (zeroes.length > 0) {
        console.log("Sample:", zeroes[0]);
    }
}
check();
