const mongoose = require("mongoose");
const Listing = require("./models/listing");
require('dotenv').config();

const dbURL = process.env.ATLASDB_URL || "mongodb://localhost:27017/findyourstay";

async function addAmenitiesToExistingListings() {
    try {
        await mongoose.connect(dbURL);
        console.log('Connected to MongoDB');

        // Get all listings that don't have amenities
        const listings = await Listing.find({});
        console.log(`Found ${listings.length} listings`);

        // Default amenities for different types of properties
        const defaultAmenities = {
            wifi: true,
            swimmingPool: false,
            airConditioning: true,
            kitchenFacilities: true,
            parkingSpace: true,
            laundryFacilities: false,
            gym: false,
            spaServices: false,
            outdoorSpace: true,
            conciergeServices: false,
        };

        // Luxury amenities for high-end properties
        const luxuryAmenities = {
            wifi: true,
            swimmingPool: true,
            airConditioning: true,
            kitchenFacilities: true,
            parkingSpace: true,
            laundryFacilities: true,
            gym: true,
            spaServices: true,
            outdoorSpace: true,
            conciergeServices: true,
        };

        // Budget amenities for budget properties
        const budgetAmenities = {
            wifi: true,
            swimmingPool: false,
            airConditioning: false,
            kitchenFacilities: true,
            parkingSpace: true,
            laundryFacilities: false,
            gym: false,
            spaServices: false,
            outdoorSpace: false,
            conciergeServices: false,
        };

        let updatedCount = 0;

        for (const listing of listings) {
            let amenitiesToAdd;

            // Determine amenities based on price and category
            if (listing.price >= 400) {
                amenitiesToAdd = luxuryAmenities;
            } else if (listing.price <= 200) {
                amenitiesToAdd = budgetAmenities;
            } else {
                amenitiesToAdd = defaultAmenities;
            }

            // Add specific amenities based on category
            if (listing.category === 'Amazing Pools') {
                amenitiesToAdd.swimmingPool = true;
            }
            if (listing.category === 'Mountains') {
                amenitiesToAdd.outdoorSpace = true;
            }
            if (listing.category === 'Castles') {
                amenitiesToAdd.conciergeServices = true;
                amenitiesToAdd.spaServices = true;
            }

            // Update the listing with amenities
            await Listing.findByIdAndUpdate(listing._id, {
                amenities: amenitiesToAdd
            });

            updatedCount++;
            console.log(`Updated listing: ${listing.title}`);
        }

        console.log(`Successfully updated ${updatedCount} listings with amenities`);
        process.exit(0);

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

addAmenitiesToExistingListings();
