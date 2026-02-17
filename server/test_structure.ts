
import fetch from 'node-fetch';

const API_URL = 'http://localhost:3000/api';

async function run() {
    console.log('--- Testing GET /routes/structure ---');

    const res = await fetch(`${API_URL}/routes/structure`);
    if (!res.ok) {
        console.error('Failed to fetch structure:', res.status, res.statusText);
        return;
    }

    const structure = await res.json();
    console.log('Structure received. Count:', structure.length);
    if (structure.length > 0) {
        console.log('Sample Route:', JSON.stringify(structure[0], null, 2));
    } else {
        console.log('No routes found. Create some data to test hierarchy.');
    }
}

run();
