import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { users, newUser, registerPushToken } from '../controllers/user.controller.js';

const router = express.Router();

router.post('/secure/new-user', authenticateToken, newUser)
router.get('/users', users)
router.post('/users/push-token', registerPushToken);

export {router}