// models/userModel.js
const mongoose = require("mongoose");

// 🧩 Foydalanuvchi (ota-ona) sxemasi
const userSchema = new mongoose.Schema({
  chatId: { type: String, required: true },
  parentName: { type: String, default: "" },
  className: { type: String, default: "" },
  childFullName: { type: String, default: "" },
  isAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// 📦 Model
const UserModel = mongoose.model("Parent", userSchema);

module.exports = UserModel;
