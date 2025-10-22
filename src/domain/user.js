import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  email: { type: String, required: true },
  UID: { type: String, required: true },
  pushToken: { type: String },
  platform: { type: String, enum: ['android', 'ios'] },
  settings: {
    type: {
      allowNotifications: { type: Boolean, default: true }
    },
    default: { allowNotifications: true }
  }
});

const User_DB = mongoose.model("User", userSchema);
export {User_DB}