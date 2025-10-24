// services/storage.js
const mongoose = require("mongoose");
const UserModel = require("../model/usersModel.js");

module.exports = (USE_MONGODB, MONGODB_URI) => {
  if (!USE_MONGODB) {
    console.error(
      "❌ MongoDB o‘chirilgan. .env faylida USE_MONGODB=true qilib yoqing!"
    );
    process.exit(1);
  }

  // 🔗 MongoDB ulanish
  mongoose
    .connect(MONGODB_URI)
    .then(() => console.log("✅ MongoDB ulanish o‘rnatildi"))
    .catch((err) => {
      console.error("❌ MongoDB xatosi:", err);
      process.exit(1);
    });

  // 📦 API funksiyalar
  const Users = {
    addUser: async (u) => {
      return await UserModel.findOneAndUpdate(
        {
          chatId: u.chatId,
          className: u.className,
          childFullName: u.childFullName,
        },
        u,
        { upsert: true, new: true }
      );
    },

    findByClassAndName: async (className, childFullName) =>
      UserModel.find({
        className: new RegExp("^" + className + "$", "i"),
        childFullName: new RegExp("^" + childFullName + "$", "i"),
      }),

    listAll: async () => UserModel.find({}),
    getAll: async () => UserModel.find({}), // getAll() qo‘shildi
  };

  return Users;
};
