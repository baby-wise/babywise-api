import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.CF_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CF_KEY_ID,
    secretAccessKey: process.env.CF_KEY_SECRET,
  },
  forcePathStyle: true,
});

/**
 * Lista todas las grabaciones de un room, agrupadas por participante
 * @param {string} room - Nombre del room
 * @returns {Promise<Array>} Array de {participant, recordings: [...]}
 */
export const getRecordingsByRoom = async (room) => {
  const bucket = process.env.CF_BUCKET_NAME;
  const prefix = `recordings/${room}/`;
  
  let recordingsByParticipant = {};
  let continuationToken = undefined;
  
  do {
    const params = {
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 1000,
      ContinuationToken: continuationToken,
    };
    
    const resp = await s3Client.send(new ListObjectsV2Command(params));
    
    for (const obj of resp.Contents || []) {
      // Esperado: obj.Key = recordings/{room}/{participant}/{fecha}/{hora}/hls000.ts o playlist.m3u8
      const keyParts = obj.Key.split('/');
      const participantIdentity = keyParts[2];
      const date = keyParts[3];
      const time = keyParts[4];

      if (!participantIdentity || !date || !time) continue;
      
      if (!recordingsByParticipant[participantIdentity]) {
        recordingsByParticipant[participantIdentity] = {};
      }
      
      const recId = `${date}_${time}`;
      if (!recordingsByParticipant[participantIdentity][recId]) {
        recordingsByParticipant[participantIdentity][recId] = {
          date,
          time,
          playlistUrl: null,
          key: null,
          duration: 0,
        };
      }
      
      if (obj.Key.endsWith('.m3u8') && !obj.Key.endsWith('-live.m3u8')) {
        recordingsByParticipant[participantIdentity][recId].playlistUrl = `${process.env.CF_PUBLIC_URL}${obj.Key}`;
        recordingsByParticipant[participantIdentity][recId].key = obj.Key;
      }
      
      if (obj.Key.endsWith('.ts')) {
        recordingsByParticipant[participantIdentity][recId].duration += 10;
      }
    }
    
    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken);
  
  // Convertir a formato de respuesta: array de { participant, recordings: [ ... ] }
  let result = [];
  for (const [participant, recMap] of Object.entries(recordingsByParticipant)) {
    const recordings = Object.values(recMap).filter(r => r.playlistUrl);
    if (recordings.length > 0) {
      result.push({ participant, recordings });
    }
  }
  return result;
};

/**
 * Busca el segmento de grabación más reciente para un participante específico
 * que esté cerca del timestamp del evento
 * @param {string} room - Nombre del room
 * @param {string} participantIdentity - Identidad del participante (bebé/cámara)
 * @param {Date} eventTimestamp - Timestamp del evento detectado
 * @returns {Promise<Object|null>} {segmentUrl, segmentKey, recordingDate, recordingTime} o null
 */
export const getLatestSegmentForEvent = async (room, participantIdentity, eventTimestamp) => {
  try {
    const bucket = process.env.CF_BUCKET_NAME;
    const prefix = `recordings/${room}/${participantIdentity}/`;
    
    console.log(`[RecordingService] Buscando segmento para room=${room}, participant=${participantIdentity}, event=${eventTimestamp}`);
    
    let allSegments = [];
    let continuationToken = undefined;
    
    // Listar todos los segmentos .ts del participante
    do {
      const params = {
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      };
      
      const resp = await s3Client.send(new ListObjectsV2Command(params));
      
      for (const obj of resp.Contents || []) {
        if (obj.Key.endsWith('.ts')) {
          allSegments.push({
            key: obj.Key,
            lastModified: obj.LastModified,
            size: obj.Size
          });
        }
      }
      
      continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (continuationToken);
    
    if (allSegments.length === 0) {
      console.log(`[RecordingService] No se encontraron segmentos para ${participantIdentity}`);
      return null;
    }
    
    // Ordenar por lastModified descendente (más reciente primero)
    allSegments.sort((a, b) => b.lastModified - a.lastModified);
    
    // Buscar el segmento que esté dentro de una ventana de tiempo razonable
    // El evento debería ocurrir mientras se está grabando ese segmento o justo después
    const eventTime = new Date(eventTimestamp).getTime();
    const tolerance = 60 * 1000; // 60 segundos de tolerancia
    
    for (const segment of allSegments) {
      const segmentTime = new Date(segment.lastModified).getTime();
      const timeDiff = eventTime - segmentTime;
      
      // El segmento debe ser anterior o muy cercano al evento (dentro de la tolerancia)
      if (timeDiff >= 0 && timeDiff <= tolerance) {
        // Extraer fecha y hora del path
        const keyParts = segment.key.split('/');
        const date = keyParts[3];
        const time = keyParts[4];
        const fileName = keyParts[5];
        
        console.log(`[RecordingService] Segmento encontrado: ${segment.key}, diff=${timeDiff}ms`);
        
        return {
          segmentUrl: `${process.env.CF_PUBLIC_URL}/${segment.key}`,
          segmentKey: segment.key,
          recordingDate: date,
          recordingTime: time,
          fileName: fileName,
          lastModified: segment.lastModified
        };
      }
    }
    
    // Si no encontramos uno en la ventana de tiempo, devolver el más reciente
    // (puede pasar si hay un pequeño delay en la sincronización)
    const latestSegment = allSegments[0];
    const keyParts = latestSegment.key.split('/');
    const date = keyParts[3];
    const time = keyParts[4];
    const fileName = keyParts[5];
    
    console.log(`[RecordingService] Usando segmento más reciente (fuera de ventana): ${latestSegment.key}`);
    
    return {
      segmentUrl: `${process.env.CF_PUBLIC_URL}/${latestSegment.key}`,
      segmentKey: latestSegment.key,
      recordingDate: date,
      recordingTime: time,
      fileName: fileName,
      lastModified: latestSegment.lastModified
    };
    
  } catch (error) {
    console.error('[RecordingService] Error al buscar segmento:', error);
    return null;
  }
};

/**
 * Busca el segmento de grabación más reciente para un evento (con delay opcional)
 * Útil cuando el segmento aún no está disponible en S3
 * @param {string} room - Nombre del room
 * @param {string} participantIdentity - Identidad del participante
 * @param {Date} eventTimestamp - Timestamp del evento
 * @param {number} delaySeconds - Segundos a esperar antes de buscar (default: 10)
 * @returns {Promise<Object|null>}
 */
export const getLatestSegmentWithDelay = async (room, participantIdentity, eventTimestamp, delaySeconds = 10) => {
  console.log(`[RecordingService] Esperando ${delaySeconds}s antes de buscar segmento...`);
  await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
  return getLatestSegmentForEvent(room, participantIdentity, eventTimestamp);
};
