const User = require("../models/user.js");
const nodemailer = require('nodemailer');

module.exports.renderSignupForm = (req, res) => {
  res.render("users/signup.ejs");
};

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Use the app password here
  },
});

module.exports.signup = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    // Check if the username or email already exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });

    if (existingUser) {
      // If a user with the same username or email exists, flash an error message
      req.flash("error", "Username or email already exists.");
      return res.redirect("/signup"); // Redirect back to signup page
    }

    const newUser = new User({ email, username });
    const registeredUser = await User.register(newUser, password);
    console.log(registeredUser);

    // Email content
    const mailOptions = {
      from: '"FindYourStay" <no-reply@findyourstay.com>', // Replace with your "from" email
      to: registeredUser.email, // Send to the registered user's email
      subject: 'Welcome to FindYourStay!',
      text: ` Hi ${registeredUser.username},Welcome to FindYourStay!We're thrilled to have you join our community of travelers and hosts.
    Whether you're looking for the perfect stay or planning to list your own property,
    we're here to make your experience seamless and enjoyable.
    If you have any questions or need assistance, feel free to reach out to us anytime.
    Happy exploring!
    Best regards,
    The FindYourStay Team`

    };

    // Send the email
    await transporter.sendMail(mailOptions);

    // Log the user in
    req.login(registeredUser, (err) => {
      if (err) {
        return next(err);
      }
      req.flash("success", "Welcome to FindYourStay! A confirmation email has been sent to your inbox.");
      res.redirect("/listings");
    });

  } catch (e) {
    req.flash("error", e.message);
    res.redirect("/signup");
  }
};


module.exports.renderLoginForm = (req, res) => {
  res.render("users/login.ejs");
};

module.exports.login = async (req, res) => {
  req.flash("success", "Welcome to FindYourStay! You are logged in!");
  const redirectUrl = res.locals.redirectUrl || "/listings";
  res.redirect(redirectUrl);
};

module.exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.flash("success", "You are logged out!");
    res.redirect("/listings");
  });
};
