
const express = require('express');
const router = express.Router();
const { isLoggedIn } = require('../middleware');
const Listing = require('../models/listing');

// Route to render My Account page
router.get('/my-account', isLoggedIn, async (req, res) => {
    try {
        // Fetch listings for the logged-in user
        const listings = await Listing.find({ owner: req.user._id });
        res.render('users/my-account', { listings });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Unable to load listings');
        res.redirect('/');
    }
});

module.exports = router;
