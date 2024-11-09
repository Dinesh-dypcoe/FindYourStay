const express = require("express");
const router = express.Router();
const Listing = require("../models/listing");
const wrapAsync = require("../utils/wrapAsync");
const ExpressError = require("../utils/ExpressError");
const { listingSchema } = require("../schema");
const mongoose = require("mongoose");
const { isLoggedIn, isOwner } = require("../middleware");
const listings = require("../controllers/listings");
const multer = require('multer');
const { storage } = require("../cloudConfig");
const upload = multer({ storage });
const Joi = require('joi');
const Razorpay = require("razorpay");
const nodemailer = require("nodemailer");

// Razorpay instance configuration
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET,
});

// Default image URL if no image is provided
const defaultImageUrl = 'https://images.unsplash.com/photo-1518684079-3c830dcef090?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8ZHViYWl8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=800&q=60';

// Middleware for validating listing input
const validateListing = (req, res, next) => {
  const { listing } = req.body;

  if (!listing) {
      return res.status(400).json({ error: "Listing data is required" });
  }

  if (!listing.amenities) {
      listing.amenities = {}; // Initialize amenities as an empty object if missing
  }

  next();
};

// Route to get listings and create a new listing
router
  .route("/")
  .get(wrapAsync(listings.index))
  .post(
    isLoggedIn,
    upload.single('listing[image]'),
    validateListing,
    wrapAsync(listings.createListing)
  );

// Route to render the new listing form
router.get("/new", isLoggedIn, listings.renderNewForm);

// Route to search for listings
router.get("/search", wrapAsync(listings.searchListing));

// Routes to show, edit, update, and delete a listing by ID
router
  .route("/:id")
  .get(wrapAsync(listings.showListing))
  .put(
    isLoggedIn,
    isOwner,
    upload.single('listing[image]'),
    validateListing,
    wrapAsync(listings.updateListing)
  )
  .delete(isLoggedIn, isOwner, wrapAsync(listings.deleteListing));

// Route to render the edit form for a listing
router.get("/:id/edit", isLoggedIn, isOwner, listings.renderEditForm);

// Route to search listings by category
router.get("/category/:category", wrapAsync(listings.searchCategory));

// Route to render the booking page
router.get('/:id/book', isLoggedIn, async (req, res) => {
  try {
    const listingId = req.params.id;
    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).send('Listing not found');
    }

    res.render('listings/booking', { listing, user: req.user }); // Pass 'user' to the template
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});


// Route to create a Razorpay order for a booking
router.post('/:id/create-order', async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).send('Listing not found');
    }

    const totalAmount = req.body.totalAmount;
    
    if (!totalAmount) {
      console.log("Error: No amount received from the client");
      return res.status(400).json({ error: "Amount is required" });
    }

    const receiptId = `rcpt_${req.params.id.slice(-6)}_${Date.now()}`;

    const options = {
      amount: totalAmount * 100, // Convert to paise for Razorpay
      currency: "INR",
      receipt: receiptId,
    };

    const order = await razorpay.orders.create(options);
    res.json({ orderId: order.id, amount: totalAmount });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).send("Server Error");
  }
});

// Route to send a booking confirmation email
router.post('/:id/send-booking-email', async (req, res) => {
    try {
        const { email, checkinDate, checkoutDate, listingTitle, totalAmount } = req.body;
        
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: `Booking Confirmation for ${listingTitle}`,
            text: `Thank you for booking at FindYourStay!\n\nDetails:\nListing: ${listingTitle}\nCheck-in Date: ${checkinDate}\nCheck-out Date: ${checkoutDate}\nTotal Amount Paid (including GST): ₹${totalAmount.toFixed(2)}\n\nWe look forward to hosting you!`,
        };

        await transporter.sendMail(mailOptions);
        res.json({ message: "Email sent successfully!" });
    } catch (error) {
        console.error("Error sending email:", error);
        res.status(500).json({ error: "Failed to send email." });
    }
});

module.exports = router;
