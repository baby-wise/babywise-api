import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { users, newUser, registerPushToken, updateUserSettings, getUserSettings } from '../controllers/user.controller.js';

const router = express.Router();

router.post('/secure/new-user', authenticateToken, newUser)
router.get('/users', users)
router.post('/users/push-token', registerPushToken);
router.post('/secure/update-user-settings', authenticateToken, updateUserSettings);
router.get('/secure/user-settings/:UID', authenticateToken, getUserSettings);

export {router}