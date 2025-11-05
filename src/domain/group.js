import mongoose from "mongoose";
import { User_DB } from "./user.js";
import { Ruleset } from "firebase-admin/security-rules";

class Group {
    constructor({_id, name, users, cameras, admins, settings, rules }) {
        this._id = _id
        this.name = name;
        this.users = users || [];
        this.cameras = cameras || [];
        this.admins = admins || [];
        this.settings = settings || {
            cryDetection: true,
            audioVideoRecording: true,
            motionDetection: false
        };
        this.rules = rules || []
    }

    addMember(newMember) {
        this.users.push({user:newMember});
    }

    removeMember(memberToRemove) {
        this.admins = this.admins.filter((member) => member._id.toString() !== memberToRemove._id.toString())
        this.users = this.users.filter((member) => member.user._id.toString() !== memberToRemove._id.toString())
    }

    isAdmin(member) {
        return this.admins.some(
            (admin) => admin._id.toString() === member._id.toString()
        );
    }

    addAdmin(member) {
        if (!this.isAdmin(member)) {
            this.admins.push(member);
        }
    }

    addCamera(camaraName) {
        const existingCamaraName = this.existingBabyName(camaraName)

        if(!existingCamaraName){
            this.cameras.push({
                name: camaraName,
                status: "ONLINE"
            })
        }

    }
    existingBabyName(name){
        const normName = normalizeName(name)
        return Object.values(this.cameras).some(c=> normalizeName(c.name) === normName) 
    }
    getPermissionsForMember(member){
        const userEntry = this.users.find(
            entry => entry.user._id.toString() === member._id.toString()
        );
        return userEntry.permission
    }
    updatePermissionsForMember(member, newPermissions) {
        const userEntry = this.users.find(
            entry => entry.user._id.toString() === member._id.toString()
        );
        // Actualizar los permisos que se pasaron
        userEntry.permission = {
            ...userEntry.permission,
            ...newPermissions,
        };
    }
    addRule(rule){
        this.rules.push(rule)
    }
    updateRule(rule) {
        const index = this.rules.findIndex(
        entry => entry._id.toString() === rule._id.toString()
        );
        
        if (index !== -1) {
            this.rules[index] = {
                ...this.rules[index],
                ...rule,
            };
        }
    }

    deleteRule(ruleId) {
        this.rules = this.rules.filter(
        entry => entry._id.toString() !== ruleId.toString()
        );
    }
}

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  users: [{ user:{type: mongoose.Schema.Types.ObjectId, ref: "User"},
            role: {type: String, enum: ['viewer', 'camera'], default: 'viewer'},
            permission:{
                camera: {type: Boolean, default: true},
                viewer: {type: Boolean, default: true}
            }
  }],
  cameras: [{
    name: { type: String},
    status: {type: String, enum: ['ONLINE', 'OFFLINE'], default: 'OFFLINE'}
  }],
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  settings: {
    cryDetection: { type: Boolean, default: true },
    audioVideoRecording: { type: Boolean, default: true },
    motionDetection: { type: Boolean, default: false }
  },
  rules:[{
    event: { type: String, enum: ["LLANTO", "MOVIMIENTO"], required: true },
    action: { type: String, required: true },
    audio: { type: String },
    scope: { type: String, enum: ["GLOBAL", "CAMERA"], default: "GLOBAL" },
    cameraIdentity: { type: String }, // si es scope === "CAMERA"
  }]
});

function normalizeName(name) {
  return name
    .normalize("NFD")                // separa letras de tildes
    .replace(/[\u0300-\u036f]/g, "") // elimina tildes
    .replace(/\s+/g, "")             // elimina espacios
    .toLowerCase();
}


const Group_DB = mongoose.model("Group", groupSchema);
export { Group_DB, Group };