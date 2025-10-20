import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import wav from 'wav-encoder';

const audioBuffersByTrack = {};
const FLUSH_INTERVAL = 6000; // 6 segundos 

function flushAudioBufferForKey(key, audioDir) {
    console.log("[AUDIO] Flushing buffer")
    const entry = audioBuffersByTrack[key];
    if (!entry || entry.buffers.length === 0) return;
    const pcmData = Buffer.concat(entry.buffers);
    const baseName = `audio-${key}-${Date.now()}`;
    const wavPath = path.join(audioDir, `${baseName}.wav`);
    const int16 = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.length / 2);

    let audioData;
    if (int16.length % 2 === 0) {
        // Estéreo
        const left = new Float32Array(int16.length / 2);
        const right = new Float32Array(int16.length / 2);
        for (let i = 0, j = 0; i < int16.length; i += 2, j++) {
            left[j] = int16[i] / 32768;
            right[j] = int16[i + 1] / 32768;
        }
        audioData = {
            sampleRate: 48000,
            channelData: [left, right]
        };
    } else {
        // Mono
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768;
        }
        audioData = {
            sampleRate: 48000,
            channelData: [float32]
        };
    }
    wav.encode(audioData).then(wavBuffer => {
        fs.writeFileSync(wavPath, Buffer.from(wavBuffer));
        // TODO mandar archivo a la api de ia, obtener resultado y triggerar notificaciones
    }).catch(err => {
        console.error('[WS] Error al guardar WAV:', err);
    });
    entry.buffers = [];
    entry.lastFlush = Date.now();
}

function handleRawDataSocketMessage(data, isBinary, bufferKey) {
    if (isBinary) {
        audioBuffersByTrack[bufferKey].buffers.push(data);
    } else {
        try {
            const msg = JSON.parse(data.toString());
            console.log('[WS] Mensaje de control:', msg);
        } catch {
            console.error('[WS] Error al procesar mensaje de control');
        }
    }
}

function handleCloseSocketConnection(flushInterval, bufferKey, audioDir) {
    flushAudioBufferForKey(bufferKey, audioDir);
    clearInterval(flushInterval);
    delete audioBuffersByTrack[bufferKey];
    console.log(`[WS] Conexión de egress cerrada para ${bufferKey}`);
}

export function setUpAudioEgressSocketServer(ws, req) {
    // Extraer trackID y participant de la query string
    const url = new URL(req.url, `ws://${req.headers.host}`);
    const trackID = url.searchParams.get('trackID') || 'unknownTrack';
    const participant = url.searchParams.get('participant') || 'unknownParticipant';
    const bufferKey = `${trackID}_${participant}`;
    console.log(`[WS] Nueva conexión de egress para análisis de audio: trackID=${trackID}, participant=${participant}`);

    if (!audioBuffersByTrack[bufferKey]) {
        audioBuffersByTrack[bufferKey] = {
            buffers: [],
            lastFlush: Date.now(),
        };
    }
   
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const audioDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
    }

    const flushInterval = setInterval(() => {
    const entry = audioBuffersByTrack[bufferKey];
    if (entry && Date.now() - entry.lastFlush >= FLUSH_INTERVAL) {
        flushAudioBufferForKey(bufferKey, audioDir);
    }
    }, 1000);

    ws.on('message', (data, isBinary) => handleRawDataSocketMessage(data, isBinary, bufferKey));
    ws.on('close', () => handleCloseSocketConnection(flushInterval, bufferKey, audioDir));
}