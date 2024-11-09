const express = require("express");
const router = express.Router();
const User = require("../models/user.js");
const wrapAsync = require("../utils/wrapAsync.js");
const passport = require("passport");
const { saveRedirectUrl } = require("../middleware.js");
const userController = require("../controllers/users.js");
const nodemailer = require('nodemailer');

// Google OAuth login route
router.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// Google OAuth callback route
router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect('/listings');
  }
);
   
// Logout route
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.flash('success', 'You have logged out successfully.');
    res.redirect('/');
  });
});

// Signup and login routes
router.route("/signup")
  .get(userController.renderSignupForm)
  .post(wrapAsync(userController.signup));

  router.route("/login")
  .get(userController.renderLoginForm)
  .post(saveRedirectUrl, passport.authenticate("local", {
    failureRedirect: '/login',
    failureFlash: true
  }), userController.login);

// Privacy, terms, and refund routes
router.get('/privacy', (req, res) => {
  res.render('users/privacy');
});

router.get('/terms', (req, res) => {
  res.render('users/terms');
});

router.get('/refund', (req, res) => {
  res.render('users/refund');
});

router.get('/contact', (req, res) => {
  res.render('users/contact');
});

// Contact form submission with email
router.post('/contact', async (req, res) => {
  const { name, email, message } = req.body;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: email,
    to: process.env.EMAIL_USER,
    subject: `New Contact Form Submission from ${name}`,
    text: `Message from ${name} (${email}):\n\n${message}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    req.flash('success', 'Your message has been sent successfully!');
    return res.redirect('/');
  } catch (error) {
    console.error("Error sending email:", error);
    req.flash('error', 'There was an error sending your message. Please try again later.');
    return res.redirect('/contact');
  }
});

module.exports = router;
