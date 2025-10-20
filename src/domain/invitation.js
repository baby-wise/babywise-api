import mongoose from "mongoose";

class InvitationCode{
    constructor({code, groupId, used}){
        this.code = code
        this.groupId = groupId,
        this.used = used || false
    }
}

const invitationCodeSchema = new mongoose.Schema({
  code: { type: String, unique: true, required: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  used: { type: Boolean, default: false }
});

const InvitationCode_DB = mongoose.model('InvitationCode', invitationCodeSchema);

export {InvitationCode, InvitationCode_DB}