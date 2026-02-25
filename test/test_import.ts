import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:3001/api/gtfs/structured';

async function testImport() {
    const formData = new FormData();

    const stopsPath = path.resolve(__dirname, 'Paradas.csv');
    const routesPath = path.resolve(__dirname, 'Rutas.csv');
    const itinPath = path.resolve(__dirname, 'Itinerario.csv');

    if (fs.existsSync(stopsPath)) formData.append('stops', fs.createReadStream(stopsPath));
    if (fs.existsSync(routesPath)) formData.append('routes', fs.createReadStream(routesPath));
    if (fs.existsSync(itinPath)) formData.append('itineraries', fs.createReadStream(itinPath));

    console.log('Uploading files...');
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: formData
        });

        const data = await res.json();
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error:', err);
    }
}

testImport();
