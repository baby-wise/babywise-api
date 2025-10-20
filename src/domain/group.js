import mongoose from "mongoose";
import { User_DB } from "./user.js";

class Group {
    constructor({_id, name, users, cameras, admins }) {
        this._id = _id
        this.name = name;
        this.users = users || [];
        this.cameras = cameras || [];
        this.admins = admins || [];
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
}

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  users: [{ user:{type: mongoose.Schema.Types.ObjectId, ref: "User"},
            role: {type: String, enum: ['viewer', 'camera'], default: 'viewer'}
  }],
  cameras: [{
    name: { type: String},
    status: {type: String, enum: ['ONLINE', 'OFFLINE'], default: 'OFFLINE'}
  }],
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]  
  //preferencias: { type: mongoose.Schema.Types.ObjectId, ref: "Preferencias" }
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