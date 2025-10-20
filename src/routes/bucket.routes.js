import express from 'express';
import { upload, uploadAudio, listAudios, deleteAudio, handleGetRecordings } from '../controllers/bucket.controller.js'
import multer from 'multer'
const filesUploaded = multer({ dest: 'uploads/' }) // Lugar donde se guardan los archivos subidos


export const router = express.Router();

router.post('/upload', filesUploaded.single('file'), upload)
router.post('/audios/upload', filesUploaded.single('file'), uploadAudio)
router.get('/audios', listAudios)
router.post('/audios/delete', deleteAudio)
router.get('/recordings', handleGetRecordings);