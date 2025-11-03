import fs from 'fs'
import { S3Client } from '@aws-sdk/client-s3';
import { ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { getRecordingsByRoom } from '../services/recordingService.js';

dotenv.config();

export const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.CF_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CF_KEY_ID,
    secretAccessKey: process.env.CF_KEY_SECRET,
  },
  forcePathStyle: true,
});


// Listar audios personalizados por room
export const listAudios = async (req, res) => {
  try {
    const { room } = req.query;
    if (!room) {
      return res.status(400).json({ error: 'room es requerido' });
    }
    const bucket = process.env.CF_BUCKET_NAME;
    const prefix = `audio/${room}/`;
    let audios = [];
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
        audios.push({
          key: obj.Key,
          url: `${process.env.CF_PUBLIC_URL}${obj.Key}`,
          size: obj.Size,
          lastModified: obj.LastModified,
        });
      }
      continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (continuationToken);
    res.json({ audios });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al listar audios' });
  }
};

export const uploadAudio = async (req, res) => {
  try {
    const { room, fileName } = req.body;
    if (!req.file) {
      console.log('[UPLOAD] No se subió ningún archivo');
      return res.status(400).json({ error: 'No se subió ningún archivo' });
    }
    const key = `audio/${room}/${fileName}`;
    const fileData = fs.readFileSync(req.file.path);
    const bucket = process.env.CF_BUCKET_NAME;
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileData,
      ContentType: req.file.mimetype,
    }));
    fs.unlinkSync(req.file.path);
    res.json({ fileName });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al subir audio a Cloudflare R2' });
  }
};

export const upload = async (req, res) => {
  try {
    const fileName = `videos/${Date.now()}_${req.file.originalname}`;
    const fileData = fs.readFileSync(req.file.path);
    const bucket = process.env.CF_BUCKET_NAME;
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: fileName,
      Body: fileData,
      ContentType: req.file.mimetype,
    }));
    fs.unlinkSync(req.file.path);
    res.json({ fileName });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al subir a Cloudflare R2' });
  }
};

export const deleteAudio = async (req, res) => {
  try {
    const { key, room } = req.body;
    if (!key || !room) {
      return res.status(400).json({ error: 'key y room son requeridos' });
    }
    const bucket = process.env.CF_BUCKET_NAME;
    await s3Client.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }));
    // Devolver la lista actualizada
    const prefix = `audio/${room}/`;
    let audios = [];
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
        audios.push({
          key: obj.Key,
          url: `${process.env.CF_PUBLIC_URL}/${obj.Key}`,
          size: obj.Size,
          lastModified: obj.LastModified,
        });
      }
      continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (continuationToken);
    res.json({ audios });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar audio' });
  }
};

export const handleGetRecordings = async (req, res) => {
  const { room } = req.query;
  if (!room) {
    return res.status(400).json({ error: 'room is required' });
  }
  try {
    const result = await getRecordingsByRoom(room);
    console.log(`[API] Grabaciones encontradas en el room ${room}: ${JSON.stringify(result)}`);
    res.json({ recordingsByParticipant: result });
  } catch (err) {
    console.error('[API] Error listando grabaciones:', err);
    res.status(500).json({ error: 'Error listing recordings' });
  }
}

export async function getAudio(audioName, groupId) {
  try {
    if (!audioName || !groupId) {
      throw new Error("audioName y groupId son requeridos");
    }

    const bucket = process.env.CF_BUCKET_NAME;
    const prefix = `audio/${groupId}/`;

    // Buscar cualquier archivo que empiece con el nombre indicado
    const params = {
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 1000,
    };

    const resp = await s3Client.send(new ListObjectsV2Command(params));

    if (!resp.Contents || resp.Contents.length === 0) {
      throw new Error("No se encontraron audios en este grupo");
    }

    // Buscar el archivo que coincida (sin extensión)
    const found = resp.Contents.find(obj => {
      const fileName = obj.Key
        .replace(prefix, "")
        .replace(/\.[^/.]+$/, ""); // quita extensión
      return fileName === audioName;
    });

    if (!found) {
      throw new Error("Audio no encontrado");
    }

    return `${process.env.CF_PUBLIC_URL}${found.Key}`;
  } catch (err) {
    console.error("Error al obtener audio:", err);
    throw err;
  }
}