const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Listing = require("../models/listing");
const wrapAsync = require("../utils/wrapAsync");

// Initialize Gemini AI
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Function to convert natural language to MongoDB filters using Gemini
async function convertQueryToFilters(userQuery) {
    try {
        if (!genAI) {
            console.log("Gemini API key not configured, using fallback search");
            return null;
        }
        
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `You are TravelBuddy.AI, an intelligent travel assistant that converts natural language travel queries into simple search filters.

Given a user query, return ONLY a valid JSON object with these fields:

- location: string (single city/area name, NOT an array or complex query)
- amenities: array of strings (from: wifi, swimmingPool, airConditioning, kitchenFacilities, parkingSpace, laundryFacilities, gym, spaServices, outdoorSpace, conciergeServices)
- price: object with $lte (less than or equal) for maximum price
- duration: number (if mentioned)
- activities: array of strings (if mentioned)

IMPORTANT: Keep location as a simple string, not an array or complex MongoDB query.

Example input: "I want a 3-day stay near Pune with a private pool, good Wi-Fi, and close to trekking spots under ₹5k/night"

Example output: {
  "location": "Pune",
  "amenities": ["swimmingPool", "wifi"],
  "price": { "$lte": 5000 },
  "duration": 3,
  "activities": ["trekking"]
}

User query: "${userQuery}"

Return ONLY the JSON object, no additional text or explanation.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Clean the response and try to parse as JSON
        try {
            // Remove markdown code blocks if present
            let cleanText = text.trim();
            if (cleanText.startsWith('```json')) {
                cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (cleanText.startsWith('```')) {
                cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            
            const parsedFilters = JSON.parse(cleanText);
            console.log("Gemini returned filters:", parsedFilters);
            
            // Validate that location is a simple string
            if (parsedFilters.location && typeof parsedFilters.location !== 'string') {
                console.log("Invalid location format from Gemini, converting to string:", parsedFilters.location);
                // Convert complex location to simple string if possible
                if (parsedFilters.location.$in && Array.isArray(parsedFilters.location.$in)) {
                    parsedFilters.location = parsedFilters.location.$in[0]; // Take first location
                } else if (typeof parsedFilters.location === 'object') {
                    parsedFilters.location = JSON.stringify(parsedFilters.location);
                }
            }
            
            return parsedFilters;
        } catch (parseError) {
            console.error("Failed to parse Gemini response as JSON:", text);
            return null;
        }
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return null;
    }
}

// Function to build MongoDB query from filters
function buildMongoQuery(filters) {
    const query = {};

    if (filters.location) {
        // Handle different types of location filters
        if (typeof filters.location === 'string') {
            // Simple string location - search in both location and country fields
            query.$or = [
                { location: { $regex: filters.location, $options: 'i' } },
                { country: { $regex: filters.location, $options: 'i' } }
            ];
        } else if (filters.location.$in && Array.isArray(filters.location.$in)) {
            // Array of locations - search for any of them
            const locationQueries = [];
            filters.location.$in.forEach(loc => {
                if (typeof loc === 'string') {
                    locationQueries.push(
                        { location: { $regex: loc, $options: 'i' } },
                        { country: { $regex: loc, $options: 'i' } }
                    );
                }
            });
            if (locationQueries.length > 0) {
                query.$or = locationQueries;
            }
        } else if (filters.location.$regex) {
            // Direct regex query
            query.$or = [
                { location: filters.location },
                { country: filters.location }
            ];
        }
    }

    if (filters.price && filters.price.$lte) {
        query.price = { $lte: filters.price.$lte };
    }

    if (filters.amenities && filters.amenities.length > 0) {
        const amenityQueries = filters.amenities.map(amenity => ({
            [`amenities.${amenity}`]: true
        }));
        query.$and = query.$and || [];
        query.$and.push({ $or: amenityQueries });
    }

    return query;
}

// Function to perform fallback keyword search
async function performFallbackSearch(userQuery) {
    const searchQuery = {
        $or: [
            { title: { $regex: userQuery, $options: 'i' } },
            { location: { $regex: userQuery, $options: 'i' } },
            { country: { $regex: userQuery, $options: 'i' } },
            { description: { $regex: userQuery, $options: 'i' } }
        ]
    };
    
    return await Listing.find(searchQuery).populate('owner');
}

// Route to render AI search form
router.get("/search", (req, res) => {
    res.render("ai/search");
});

// Route to handle AI search
router.post("/search", wrapAsync(async (req, res) => {
    const { query } = req.body;
    
    if (!query || query.trim() === '') {
        req.flash("error", "Please enter a search query.");
        return res.redirect("/ai/search");
    }

    try {
        // Try to convert query to structured filters using Gemini
        const filters = await convertQueryToFilters(query);
        
        let listings = [];
        let appliedFilters = null;

        if (filters) {
            // Use structured filters from Gemini
            try {
                const mongoQuery = buildMongoQuery(filters);
                console.log("MongoDB query:", JSON.stringify(mongoQuery, null, 2));
                listings = await Listing.find(mongoQuery).populate('owner');
                appliedFilters = filters;
            } catch (queryError) {
                console.error("Error building or executing MongoDB query:", queryError);
                // Fallback to basic keyword search if query fails
                listings = await performFallbackSearch(query);
                appliedFilters = { fallback: true, query: query, error: "Query failed, using fallback search" };
            }
        } else {
            // Fallback to basic keyword search
            listings = await performFallbackSearch(query);
            appliedFilters = { fallback: true, query: query };
        }

        res.render("ai/results", { 
            listings, 
            query, 
            appliedFilters,
            resultsCount: listings.length 
        });

    } catch (error) {
        console.error("Error in AI search:", error);
        req.flash("error", "An error occurred while processing your search.");
        res.redirect("/ai/search");
    }
}));

module.exports = router;
