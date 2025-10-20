import mongoose from "mongoose";
import { Group_DB } from "./group.js";

class Event{
    constructor({group, baby, type, date, recordingUrl, recordingSegmentName}){
        this.group = group,
        this.baby = baby
        this.type = type,
        this.date = date || new Date()
        this.recordingUrl = recordingUrl || null
        this.recordingSegmentName = recordingSegmentName || null
    }
}

const eventSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  baby: {type: String, required: true},
  type: {type: String, enum: ["LLANTO", "MOVIMIENTO", "BATERIA BAJA", "PERDIDA DE CONEXION"]},
  date: {type: Date},
  recordingUrl: {type: String, required: false},
  recordingSegmentName: {type: String, required: false}
});

const Event_DB = mongoose.model("event", eventSchema);
export {Event,Event_DB}
