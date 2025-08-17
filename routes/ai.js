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

        const prompt = `You are an AI assistant that converts natural language travel queries into MongoDB filter objects for a hotel/accommodation database.

Given a user query, return ONLY a valid JSON object with MongoDB filters. The JSON should include:

- location: string (city/area name)
- amenities: array of strings (from: wifi, swimmingPool, airConditioning, kitchenFacilities, parkingSpace, laundryFacilities, gym, spaServices, outdoorSpace, conciergeServices)
- price: object with $lte (less than or equal) for maximum price
- duration: number (if mentioned)
- activities: array of strings (if mentioned)

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
            
            return JSON.parse(cleanText);
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
        query.$or = [
            { location: { $regex: filters.location, $options: 'i' } },
            { country: { $regex: filters.location, $options: 'i' } }
        ];
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
            const mongoQuery = buildMongoQuery(filters);
            listings = await Listing.find(mongoQuery).populate('owner');
            appliedFilters = filters;
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
