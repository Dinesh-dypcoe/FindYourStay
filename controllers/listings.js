const OpenRouteService = require('openrouteservice-js');
const axios = require('axios');
const Listing = require("../models/listing");
const wrapAsync = require("../utils/wrapAsync");
const ExpressError = require("../utils/ExpressError");
const mongoose = require("mongoose");
const mapToken = process.env.ORS_API_KEY; 

const defaultImageUrl = 'https://images.unsplash.com/photo-1518684079-3c830dcef090?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8ZHViYWl8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=800&q=60';

const ORS_API_KEY = process.env.ORS_API_KEY;
const ORS_BASE_URL = 'https://api.openrouteservice.org/v2/geocode';

async function geocodeLocation(location) {
    try {
        const response = await axios.get('https://api.openrouteservice.org/geocode/search', {
            params: {
                api_key: ORS_API_KEY, // Use the correct API key here
                text: location, // The location string to geocode
                size: 1 // Limit the results to the first match
            }
        });

        // Check if any results were returned
        if (!response.data || !response.data.features || response.data.features.length === 0) {
            throw new Error('No results found for the given location');
        }

        // Return the first feature's coordinates
        const coordinates = response.data.features[0].geometry.coordinates; // Coordinates in [longitude, latitude] format
        return coordinates;

    } catch (error) {
        console.error('Error in geocoding location:', error.response ? error.response.data : error.message);
        throw new ExpressError('Unable to geocode location: ' + (error.response ? error.response.data.message : error.message), 400);
    }
}

module.exports.index = wrapAsync(async (req, res) => {
    const allListings = await Listing.find({}).populate('owner');
    res.render("listings/index", { allListings });
});

module.exports.renderNewForm = (req, res) => {
    res.render("listings/new");
};

module.exports.showListing = wrapAsync(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash("error", "Invalid listing ID.");
        return res.redirect("/listings");
    }

    const listing = await Listing.findById(id).populate({
        path: "reviews",
        populate: {
            path: "author",
        },
    }).populate('owner');

    if (!listing) {
        req.flash("error", "Listing you requested for does not exist!");
        return res.redirect("/listings");
    }

    console.log('Listing geometry:', listing.geometry); // Log geometry to ensure it exists

    return res.render("listings/show", { listing, mapToken, geometry: listing.geometry });
});

module.exports.createListing = wrapAsync(async (req, res, next) => {
    try {
        console.log('Starting to create a new listing...');

        // Geocode using OpenRouteService
        const coordinates = await geocodeLocation(req.body.listing.location);
        console.log('Geocoding response:', coordinates); // Log the coordinates

        // Set default image URL if no file is uploaded
        const image = {
            url: req.file ? req.file.path : defaultImageUrl,
            filename: req.file ? req.file.filename : '',
        };

        // Initialize amenities object
        const amenities = {
            wifi: false,
            swimmingPool: false,
            airConditioning: false,
            kitchenFacilities: false,
            parkingSpace: false,
            laundryFacilities: false,
            gym: false,
            spaServices: false,
            outdoorSpace: false,
            conciergeServices: false,
        };

        // Update amenities based on checked checkboxes
        if (req.body.listing.amenities) {
            for (const amenity in req.body.listing.amenities) {
                amenities[amenity] = req.body.listing.amenities[amenity] === 'true';
            }
        }

        // Create a new listing object
        const newListing = new Listing({
            ...req.body.listing,
            owner: req.user._id,
            image,
            geometry: {
                type: 'Point', // Define the geometry type
                coordinates, // Use the received coordinates here
            },
            amenities, // Include the amenities object
        });

        const savedListing = await newListing.save();
        console.log('Listing saved:', savedListing);

        console.log('Listing saved, sending response...');
        req.flash("success", "New listing created");
        res.redirect(`/listings/${newListing._id}`);
    } catch (err) {
        console.error('Error in createListing:', err);
        next(err);
    }
});

module.exports.renderEditForm = wrapAsync(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash("error", "Invalid listing ID.");
        return res.redirect("/listings");
    }

    try {
        const listing = await Listing.findById(id);
        if (!listing) {
            req.flash("error", "Listing you requested for does not exist!");
            return res.redirect("/listings");
        }

        let originalImageUrl = listing.image.url;
        originalImageUrl = originalImageUrl.replace("/upload", "/upload/w_250");

        // Pass the amenities to the form, ensuring it's an object
        const amenities = listing.amenities || {
            wifi: false,
            swimmingPool: false,
            airConditioning: false,
            kitchenFacilities: false,
            parkingSpace: false,
            laundryFacilities: false,
            gym: false,
            spaServices: false,
            outdoorSpace: false,
            conciergeServices: false,
        };

        res.render("listings/edit", { listing, originalImageUrl, amenities });
    } catch (error) {
        console.error("Error fetching listing:", error);
        req.flash("error", "An error occurred while fetching the listing.");
        return res.redirect("/listings");
    }
});



module.exports.updateListing = wrapAsync(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash("error", "Invalid listing ID.");
        return res.redirect("/listings");
    }

    try {
        console.log('Starting to update the listing...');

        // Fetch the existing listing first
        const existingListing = await Listing.findById(id);
        if (!existingListing) {
            req.flash("error", "Listing not found.");
            return res.redirect("/listings");
        }

        // Handle image updates
        let url;
        let filename;

        if (req.file) {
            // New image has been uploaded
            url = req.file.path;
            filename = req.file.filename;
        } else {
            // No new image uploaded, retain existing image details
            url = existingListing.image.url;
            filename = existingListing.image.filename;
        }

        // Handle location and geocoding
        const coordinates = await geocodeLocation(req.body.listing.location);
        console.log('Geocoding response:', coordinates); // Log the coordinates

        const geometry = {
            type: 'Point',
            coordinates // Use the received coordinates here
        };

        // Initialize amenities object (same logic as createListing)
        const amenities = {
            wifi: false,
            swimmingPool: false,
            airConditioning: false,
            kitchenFacilities: false,
            parkingSpace: false,
            laundryFacilities: false,
            gym: false,
            spaServices: false,
            outdoorSpace: false,
            conciergeServices: false,
        };

        // Update amenities based on checked checkboxes
        if (req.body.listing.amenities) {
            for (const amenity in req.body.listing.amenities) {
                amenities[amenity] = req.body.listing.amenities[amenity] === 'true';
            }
        }

        // Update the listing
        const updatedListing = await Listing.findByIdAndUpdate(id, {
            ...req.body.listing,
            image: { url, filename },
            geometry,
            amenities // Update the amenities field
        }, { new: true });

        console.log('Listing updated, sending response...');
        req.flash("success", "Listing updated successfully");
        return res.redirect(`/listings/${updatedListing._id}`);
    } catch (err) {
        console.error('Error in updateListing:', err);
        next(err);
    }
});


module.exports.deleteListing = wrapAsync(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash("error", "Invalid listing ID.");
        return res.redirect("/listings");
    }

    await Listing.findByIdAndDelete(id);
    req.flash("success", "Listing deleted successfully");
    res.redirect("/listings");
});

module.exports.searchListing = wrapAsync(async (req, res) => {
    const { query } = req.query;  // The user input from the search box
    try {
        let searchQuery = {};
        
        // If there's a search query, perform case-insensitive search on both 'country' and 'title'
        if (query) {
            searchQuery = {
                $or: [
                    { country: { $regex: query, $options: 'i' } }, // Search in 'country'
                    { title: { $regex: query, $options: 'i' } }    // Search in 'title'
                ]
            };
        }

        const allListings = await Listing.find(searchQuery);
        res.render('listings/search', { allListings, query }); // Pass the query to the view
    } catch (error) {
        console.error(error);
        req.flash('error', 'Something went wrong while searching.');
        res.redirect('/');
    }
});



module.exports.searchCategory = wrapAsync(async (req, res) => {
    const { category } = req.params;
    try {
        const allListings = await Listing.find({ category: category });
        res.render('listings/category.ejs', { allListings, category });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Something went wrong while fetching the category.');
        res.redirect('/');
    }
});
