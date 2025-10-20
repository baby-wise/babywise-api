import express from 'express';
import { handleMediaServerEvent, handleTokenGrant } from '../controllers/livekit.controller.js';

const router = express.Router();

router.use('/webhook', express.raw({ type: 'application/webhook+json' }));
router.post('/webhook', handleMediaServerEvent);
router.get('/getToken', handleTokenGrant);

export { router };