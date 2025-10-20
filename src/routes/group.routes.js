import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { groups, newGroup, addMember, removeMember, isAdmin, addAdmin, getGroupsForUser, getInviteCode, addCamera } from '../controllers/group.controller.js'
const router = express.Router();

router.get('/groups', groups)
router.post('/secure/new-group',authenticateToken,newGroup)
router.post('/secure/add-member',authenticateToken,addMember)
router.post('/secure/remove-member',authenticateToken,removeMember) 
router.post('/secure/is-admin-member',authenticateToken,isAdmin)
router.post('/secure/add-admin-member',authenticateToken,addAdmin)
router.post('/secure/groups-for-user', authenticateToken, getGroupsForUser)
router.post('/secure/invitation-code', authenticateToken, getInviteCode)
router.post('/secure/add-camera',authenticateToken, addCamera)
export {router}