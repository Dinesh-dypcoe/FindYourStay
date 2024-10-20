const { required } = require("joi");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const passportLocalMongoose = require('passport-local-mongoose');


const userSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true, // Ensures username is unique
    },
    email: {
        type: String,
        required: true,
        unique: true, // Ensures email is unique
    }
});

userSchema.pre('remove', async function(next) {
    // Delete reviews when a user is removed
    await Review.deleteMany({ author: this._id });
    next();
});

userSchema.plugin(passportLocalMongoose, { usernameField: 'username' });

module.exports = mongoose.model('User', userSchema );