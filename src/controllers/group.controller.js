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
            res.json(group)
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

export {groups, newGroup, addMember, removeMember, isAdmin, addAdmin, getGroupsForUser, 
    getInviteCode, addCamera, getGroupById, upadeteRoleInGroup, updateCameraStatus
}