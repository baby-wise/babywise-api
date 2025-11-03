import { Group_DB, Group } from "../domain/group.js"
import { getUserById } from "./user.controller.js"
import { InvitationCode, InvitationCode_DB } from "../domain/invitation.js"
import {v4 as uuidv4} from "uuid"

const groups = async (req,res)=>{
    try {
        const groups = await Group_DB.find()
            .populate("users.user")
            .populate("admins")
        
        res.json(groups)
    } catch (error) {
        console.log(error)
    }
}

const newGroup = async (req,res)=>{
    const {UID, name} = req.body
    const user = await getUserById(UID)
    if(user){
        const group = new Group({name})
        group.addMember(user)
        group.addAdmin(user)
        try {            
            const groupDB = new Group_DB(group)
            await groupDB.save()
            res.json(groupDB)
        } catch (error) {
            res.status(500).json(error)
        }
    
    }else{
        res.status(404).json({error: "User not Found"})
    }
}

const addMember  = async (req,res)=>{
    const {UID, inviteCode} = req.body
    const invitationCodeDB = await InvitationCode_DB.findOne({code: inviteCode}) || ''
    const userDB = await getUserById(UID)
    const invitationCode = new InvitationCode(invitationCodeDB)
    
    if(invitationCodeDB && userDB && !invitationCode.used){//Verifico que exista la invitacion y que exista el usuario
        const groupDB = await getGroupById(invitationCodeDB.groupId)
        const group = new Group(groupDB)

        if(!group.users.some(u => u.user._id.toString() == userDB._id.toString())){//Verifico que el usuario no esta ya en ese grupo
            group.addMember(userDB)
            try {     
                await Group_DB.updateOne(
                    {_id: groupDB._id},
                    {$set: {users: group.users}}
                )
                await InvitationCode_DB.deleteOne({code: invitationCodeDB.code})
                res.status(200).json(group)
            } catch (error) {
                res.status(500).json(error)
            }
        }else{
            res.status(304).json(group)
        }
    }else{
        res.status(404).json({error: "Invalid invitation code"})
    }
}

const removeMember  = async (req,res)=>{
    const {UID, groupId} = req.body
    const groupDB = await getGroupById(groupId)
    const userDB = await getUserById(UID)

    if(groupDB && userDB){//Verifico que exista el grupo y el usuario
        const group = new Group(groupDB)

        if(group.users.some(u => u.user._id.toString() == userDB._id.toString())){//Verifico que el usuario esta en ese grupo
            group.removeMember(userDB)
            try {       
                await Group_DB.updateOne(
                    {_id: groupDB._id},
                    {$set: {
                        users: group.users,
                        admins: group.admins
                    }}
                )
                res.status(200).json(group)
            } catch (error) {
                res.status(500).json(error)
            }
        }else{
            res.status(304).json(group)
        }
    }else{
        res.status(404).json({error: "Group or user not found"})
    }

}

const isAdmin  = async (req,res)=>{
    const {UID, groupId} = req.body
    const groupDB = await getGroupById(groupId)
    const userDB = await getUserById(UID)

    if(groupDB && userDB){//Verifico que exista el grupo y el usuario
        const group = new Group(groupDB)
        if(group.isAdmin(userDB)){
            return res.status(200).json({message: "Is admin"})
        }else{
            return res.status(200).json({message: "Is not admin"})   
        }
    }else{
        res.status(404).json({error: "Group or user not found"})
    }
}

const addAdmin  = async (req,res)=>{
    const {UID, groupId} = req.body
    const groupDB = await getGroupById(groupId)
    const userDB = await getUserById(UID)

    if(groupDB && userDB){//Verifico que exista el grupo y el usuario
        const group = new Group(groupDB)

        if(group.users.some(u => u.user._id.toString() == userDB._id.toString()) && !group.isAdmin(userDB)){//Verifico que el usuario esta en ese grupo y que no sea ya Admin
            group.addAdmin(userDB)
            try {                
                await Group_DB.updateOne(
                    {_id: groupDB._id},
                    {$set: {admins: group.admins}}
                )
                res.status(200).json(group)
            } catch (error) {
                res.status(500).json(error)
            }
        }else{
            res.status(304).json(group)
        }
    }else{
        res.status(404).json({error: "Group or user not found"})
    }
}

const getGroupsForUser  = async (req,res)=>{
    const {UID} = req.body
    const userDB = await getUserById(UID)
    if(userDB){
        try {
            const groups = await Group_DB.find({
                'users.user': userDB
            })
                .populate("admins")
                .populate("users.user")
            res.status(200).json(groups)
        } catch (error) {
            res.status(500).json(error)
        }
    }else{
        res.status(404).json({error: "User not found"})
    }
}

const getInviteCode = async (req, res) => {
    const {groupId} = req.body
    console.log("Generando Codigo de invitacion para: ", groupId)
    const groupDB = await getGroupById(groupId)
    if(groupDB){//Verifico que exista el grupo
       const code = uuidv4().split('-')[0]

        const invitationCode = new InvitationCode({code: code, groupId: groupId})
        const invitationCodeDB = new InvitationCode_DB(invitationCode)
        try {            
            await invitationCodeDB.save()
            res.status(200).json(invitationCode.code)
        } catch (error) {
            res.status(500).json(error)
        }
    }else{
        res.status(404).json({error: "Group not found"})
    }
}

async function getGroupById(groupId) {
    const group = await Group_DB.findById(groupId)
    return group
}

const addCamera = async (req, res)=>{ 
    const {groupId,name} = req.body
    const groupDB = await getGroupById(groupId)

    if(groupDB){//Verifico que exista el grupo 
        const group = new Group(groupDB)
        group.addCamera(name)
        try {
            await Group_DB.updateOne(
                { _id: groupDB._id },
                    { $set: { 
                        cameras: group.cameras
                    }}
            )
            res.status(200).json(group)
        } catch (error) {
            res.status(500).json(error)
        }
    }else{
        res.status(404).json({error: "Group or user not found"})
    }
}

async function upadeteRoleInGroup(groupId, UID, role) {
    try {
        const userDB = await getUserById(UID)
        const result = await Group_DB.updateOne({
                _id: groupId,
                "users.user": userDB._id 
            },
            {
                $set: {
                    "users.$.role": role 
                }
            }
        );

        if (result.matchedCount === 0) {
            console.log("Group or user not found.")
            return
        }
        console.log(`Rol cambiado a ${role} para el miembro ${userDB._id }`)
    } catch (error) {
        console.log("Error al hacer update del rol del usuario en el grupo")
        console.log(error)
    }
    
}

async function updateCameraStatus(groupId, cameraName, status) {
    try {
        const result = await Group_DB.updateOne({
                _id: groupId,
                "cameras.name": cameraName
            },
            {
                $set: {
                    "cameras.$.status": status 
                }
            }
        );

        if (result.matchedCount === 0) {
            console.log("Group or camera not found.")
            return
        }
        console.log(`Staus de la camara ${cameraName} cambiado a ${status}`)
    } catch (error) {
        console.log("Error al hacer update del rol del usuario en el grupo")
        console.log(error)
    }
}

const updateGroupSettings = async (req, res) => {
    const { groupId, settings, UID } = req.body;
    console.log('=== updateGroupSettings ===');
    console.log('groupId:', groupId);
    console.log('settings:', settings);
    console.log('UID:', UID);

    try {
        const groupDB = await getGroupById(groupId);
        const userDB = await getUserById(UID);
        
        if (!groupDB) {
            return res.status(404).json({ error: "Group not found" });
        }

        if (!userDB) {
            return res.status(404).json({ error: "User not found" });
        }

        // Verificar que el usuario sea admin del grupo
        const group = new Group(groupDB);
        if (!group.isAdmin(userDB)) {
            console.log('User is not admin, rejecting settings update');
            return res.status(403).json({ error: "Only admins can update group settings" });
        }

        // Validar que settings tenga la estructura correcta
        const validSettings = {
            cryDetection: settings.cryDetection !== undefined ? Boolean(settings.cryDetection) : groupDB.settings?.cryDetection || true,
            audioVideoRecording: settings.audioVideoRecording !== undefined ? Boolean(settings.audioVideoRecording) : groupDB.settings?.audioVideoRecording || true,
            motionDetection: settings.motionDetection !== undefined ? Boolean(settings.motionDetection) : groupDB.settings?.motionDetection || false
        };

        const result = await Group_DB.updateOne(
            { _id: groupDB._id },
            { $set: { settings: validSettings } }
        );

        console.log('Settings updated successfully:', validSettings);
        
        // Obtener el grupo actualizado
        const updatedGroup = await getGroupById(groupId);
        res.status(200).json(updatedGroup);
        
    } catch (error) {
        console.error('Error updating group settings:', error);
        res.status(500).json({ error: "Error updating group settings" });
    }
};

async function getGroupSettings(groupId) {
    try {
        const group = await getGroupById(groupId);
        if (!group) {
            return {
                cryDetection: true,
                audioVideoRecording: true,
                motionDetection: false
            };
        }
        return group.settings || {
            cryDetection: true,
            audioVideoRecording: true,
            motionDetection: false
        };
    } catch (error) {
        console.error('Error getting group settings:', error);
        return {
            cryDetection: true,
            audioVideoRecording: true,
            motionDetection: false
        };
    }
}

const getGroupSettingsHandler = async (req, res) => {
    const { groupId } = req.params;
    console.log('=== getGroupSettings ===');
    console.log('groupId:', groupId);

    try {
        const settings = await getGroupSettings(groupId);
        res.status(200).json(settings);
    } catch (error) {
        console.error('Error getting group settings:', error);
        res.status(500).json({ error: "Error getting group settings" });
    }
};

const getUserPermission = async (req, res) =>{
    const { groupId, UID } = req.params;
    console.log(`Obteniendo los permisos para el user: ${UID} en el grupo: ${groupId}`)
    try {
        const groupDB = await getGroupById(groupId)
        const userDB = await getUserById(UID)
        if(groupDB && userDB){//Verifico que exista el grupo y el usuario
            const group = new Group(groupDB)
            const permisos = group.getPermissionsForMember(userDB)
            res.status(200).json(permisos)
            
        }else{
            res.status(404).json({error: "Group or user not found"})
        }
    } catch (error) {
        console.error('Error getting group settings:', error);
        res.status(500).json({ error: "Error getting user permission" });
    }
}

const updateUserPermission = async (req, res) =>{
    const { groupId} = req.params;
    const { UID, permissionType } = req.body;
    console.log(`Cambiando los permisos para el user: ${UID} en el grupo: ${groupId}`)
    try {
        const groupDB = await getGroupById(groupId)
        const userDB = await getUserById(UID)
        if(groupDB && userDB){//Verifico que exista el grupo y el usuario
            const group = new Group(groupDB)
            group.updatePermissionsForMember(userDB,permissionType)
            await Group_DB.updateOne(
                { _id: groupDB._id },
                    { $set: { 
                        users: group.users
                    }}
            )
            res.status(200).json(group)
        }else{
            res.status(404).json({error: "Group or user not found"})
        }
    } catch (error) {
        console.error('Error getting group settings:', error);
        res.status(500).json({ error: "Error updating user permission" });
    }
}

const getRules = async (req, res) =>{
    const { groupId} = req.params;
    console.log(`Obteniendo las reglas para el grupo: ${groupId}`)
    try {
        const groupDB = await getGroupById(groupId)
        if(groupDB ){//Verifico que exista el grupo
            res.status(200).json(groupDB.rules)
        }else{
            res.status(404).json({error: "Group not found"})
        }
    } catch (error) {
        console.error('Error getting group settings:', error);
        res.status(500).json({ error: "Error updating user permission" });
    }
}
const addRules = async (req, res) =>{
    const { groupId} = req.params;
    const { rule } = req.body

    console.log(`Agregando reglas para el grupo: ${groupId}`)
    try {
        const groupDB = await getGroupById(groupId)
        if(groupDB ){//Verifico que exista el grupo
            const group = new Group(groupDB)
            group.addRule(rule)
            await Group_DB.updateOne(
                { _id: groupDB._id },
                    { $set: { 
                        rules: group.rules
                    }}
            )
            res.status(200).json(group.rules)
        }else{
            res.status(404).json({error: "Group not found"})
        }
    } catch (error) {
        console.error('Error getting group settings:', error);
        res.status(500).json({ error: "Error updating user permission" });
    }
}
const updateRules = async (req, res) =>{
    const { groupId} = req.params;
    const { rule } = req.body

    console.log(`Actualizando las reglas para el grupo: ${groupId}`)
    try {
        const groupDB = await getGroupById(groupId)
        if(groupDB ){//Verifico que exista el grupo
            const group = new Group(groupDB)
            group.updateRule(rule)
            await Group_DB.updateOne(
                { _id: groupDB._id },
                    { $set: { 
                        rules: group.rules
                    }}
            )
            res.status(200).json(group.rules)
        }else{
            res.status(404).json({error: "Group not found"})
        }
    } catch (error) {
        console.error('Error getting group settings:', error);
        res.status(500).json({ error: "Error updating user permission" });
    }
}
const deleteRules = async (req, res) =>{
    const { groupId} = req.params;
    const { ruleId } = req.body

    console.log(`Eliminando la regla ${ruleId} para el grupo: ${groupId}`)
    try {
        const groupDB = await getGroupById(groupId)
        if(groupDB ){//Verifico que exista el grupo
            const group = new Group(groupDB)
            group.deleteRule(ruleId)
            await Group_DB.updateOne(
                { _id: groupDB._id },
                    { $set: { 
                        rules: group.rules
                    }}
            )
            res.status(200).json(group.rules)
        }else{
            res.status(404).json({error: "Group not found"})
        }
    } catch (error) {
        console.error('Error getting group settings:', error);
        res.status(500).json({ error: "Error updating user permission" });
    }
}

export {groups, newGroup, addMember, removeMember, isAdmin, addAdmin, getGroupsForUser, 
    getInviteCode, addCamera, getGroupById, upadeteRoleInGroup, updateCameraStatus,
    updateGroupSettings, getGroupSettings, getGroupSettingsHandler, getUserPermission,
    updateUserPermission, getRules, addRules, updateRules, deleteRules
}