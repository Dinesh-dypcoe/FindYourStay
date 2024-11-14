const express = require('express');
const router = express.Router();
const { isLoggedIn } = require('../middleware');
const Listing = require('../models/listing');
const User = require('../models/user');
const crypto = require('crypto');

// Function to generate avatar URL
function generateAvatarURL(username) {
    return 'https://avatar.iran.liara.run/public/boy?username=[username]';
}

// Route to render My Account page
router.get('/my-properties', isLoggedIn, async (req, res) => {
    try {
        // Fetch listings for the logged-in user
        const listings = await Listing.find({ owner: req.user._id });
        res.render('users/my-properties', { listings });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Unable to load listings');
        res.redirect('/');
    }
});

// GET profile page
router.get('/profile', isLoggedIn, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const avatarURL = generateAvatarURL(user.username);  // Generate avatar URL for user
        
        res.render('users/profile', { user, avatarURL });
    } catch (error) {
        req.flash("error", "Cannot load profile information.");
        res.redirect('/');
    }
});

// POST update profile
router.post('/account/profile', isLoggedIn, async (req, res) => {
    try {
        const { username, email } = req.body;
        const user = await User.findByIdAndUpdate(req.user._id, { username, email }, { new: true });
        
        req.flash("success", "Profile updated successfully!");
        res.redirect("/profile");
    } catch (error) {
        req.flash("error", "Error updating profile.");
        res.redirect('/profile');
    }
});

module.exports = router;
