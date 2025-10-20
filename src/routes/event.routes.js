import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { events, newEvent, getEventsByGroup, getEventsByCamera, receiveDetectionEvent } from '../controllers/event.controller.js';

const router = express.Router();

router.get('/events', events)
router.post('/secure/new-event',authenticateToken,newEvent)
router.get('/secure/events/group/:groupId', authenticateToken, getEventsByGroup);
router.get('/events/group/:groupId/camera/:cameraName',authenticateToken, getEventsByCamera);
router.post('/events/detection', receiveDetectionEvent);

export {router}