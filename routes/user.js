const express = require("express");
const router = express.Router();
const User=require("../models/user.js");
const wrapAsync = require("../utils/wrapAsync.js");
const passport = require("passport");
const {saveRedirectUrl} = require("../middleware.js");
const userController = require("../controllers/users.js");

// Google OAuth login route
router.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// Google OAuth callback route
router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // Successful authentication, redirect to desired page
    res.redirect('/listings');
  }
);
   

// Logout route
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return next(err);
    req.flash('success', 'You have logged out successfully.');
    res.redirect('/');
  });
});

module.exports = router;



router.route("/signup")
     .get(userController.renderSignupForm)
     .post(wrapAsync(userController.signup));


router.route("/login")
     .get(userController.renderLoginForm)
     .post(saveRedirectUrl,passport.authenticate("local",{failureRedirect : '/login',failureFlash:true}), userController.login);

router.get("/logout",userController.logout);

// privacy and terms
router.get('/privacy', (req, res) => {
     res.render('users/privacy'); // Rendering privacy.ejs from 'views/users/'
   });
   
   router.get('/terms', (req, res) => {
     res.render('users/terms'); // Rendering terms.ejs from 'views/users/'
   });

module.exports = router;