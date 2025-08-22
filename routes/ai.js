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

        const prompt = `You are TravelBuddy.AI, an intelligent travel assistant that converts natural language travel queries into structured data.

Given a user query, return ONLY a valid JSON object with this schema:

{
  "filters": {
    "location": string (city/area name, NOT an array or complex query),
    "amenities": [array of strings from: wifi, swimmingPool, airConditioning, kitchenFacilities, parkingSpace, laundryFacilities, gym, spaServices, outdoorSpace, conciergeServices],
    "price": { "$lte": number } (ONLY if user explicitly mentions a price or budget),
    "duration": number (if mentioned),
    "activities": [array of strings (if mentioned)]
  },
  "placesToVisit": [
    {
      "name": "string (attraction name)",
      "description": "string (short description about the attraction, what makes it special, why visit it)"
    }
  ]
}

IMPORTANT RULES:
1. If user asks for accommodations (hotels, stays, rooms, etc.), return filters for MongoDB search.
2. If user asks for attractions (things to do, places to explore, sightseeing, food spots, nightlife, hidden gems, etc.), return them as a list of recommendations with descriptions.
3. If user asks for both (like "2 days stay in Pune"), return BOTH stays and attractions.
4. Set filters to null if no accommodation search needed.
5. Set placesToVisit to empty array if no attractions requested.
6. Each attraction should have a compelling description (2-3 sentences) explaining what it is and why it's worth visiting.
7. ONLY include price filter if user explicitly mentions a price, budget, or cost (e.g., "under ₹5000", "budget hotel", "cheap", "expensive", "luxury").
8. If no price is mentioned, omit the price field entirely from filters.

Examples:

User: "I want a 3-day stay near Pune with a pool and Wi-Fi under ₹5000/night"
Output: {
  "filters": {
    "location": "Pune",
    "amenities": ["swimmingPool", "wifi"],
    "price": { "$lte": 5000 },
    "duration": 3,
    "activities": []
  },
  "placesToVisit": []
}

User: "What are the best places to visit in Goa?"
Output: {
  "filters": null,
  "placesToVisit": [
    {
      "name": "Baga Beach",
      "description": "Famous for its vibrant nightlife, water sports, and beach shacks. Perfect for sunset views and party atmosphere."
    },
    {
      "name": "Fort Aguada",
      "description": "Historic Portuguese fort offering panoramic views of the Arabian Sea. Built in 1612, it's a great spot for photography and history buffs."
    },
    {
      "name": "Anjuna Flea Market",
      "description": "Iconic Wednesday market known for unique handicrafts, jewelry, and bohemian vibes. A must-visit for shopping and cultural experience."
    },
    {
      "name": "Dudhsagar Waterfalls",
      "description": "Majestic four-tiered waterfall surrounded by lush greenery. Best visited during monsoon season for the most spectacular views."
    }
  ]
}

User: "Plan me a 2-day trip to Jaipur with a budget hotel"
Output: {
  "filters": {
    "location": "Jaipur",
    "amenities": [],
    "duration": 2,
    "activities": []
  },
  "placesToVisit": [
    {
      "name": "Amber Fort",
      "description": "Magnificent hilltop fort-palace showcasing Rajput architecture. Features stunning mirror work, intricate carvings, and elephant rides to the entrance."
    },
    {
      "name": "Hawa Mahal",
      "description": "Iconic 'Palace of Winds' with 953 windows designed for royal women to observe street festivities. Known for its unique honeycomb structure."
    },
    {
      "name": "City Palace",
      "description": "Royal residence combining Rajasthani and Mughal architecture. Houses museums, courtyards, and the famous Peacock Gate."
    },
    {
      "name": "Local Rajasthani Cuisine at Chokhi Dhani",
      "description": "Traditional village resort offering authentic Rajasthani food, folk dances, and cultural performances. Perfect for experiencing local traditions."
    }
  ]
}

User: "Find me a hotel in Mumbai"
Output: {
  "filters": {
    "location": "Mumbai",
    "amenities": [],
    "activities": []
  },
  "placesToVisit": []
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
            
            // Validate that location is a simple string if filters exist
            if (parsedFilters.filters && parsedFilters.filters.location && typeof parsedFilters.filters.location !== 'string') {
                console.log("Invalid location format from Gemini, converting to string:", parsedFilters.filters.location);
                // Convert complex location to simple string if possible
                if (parsedFilters.filters.location.$in && Array.isArray(parsedFilters.filters.location.$in)) {
                    parsedFilters.filters.location = parsedFilters.filters.location.$in[0]; // Take first location
                } else if (typeof parsedFilters.filters.location === 'object') {
                    parsedFilters.filters.location = JSON.stringify(parsedFilters.filters.location);
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
    if (!filters) return {};
    
    const query = {};

    if (filters.location) {
       
        if (typeof filters.location === 'string') {
            
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

// Test route to debug attractions display
router.get("/test-attractions", (req, res) => {
    const testData = {
        listings: [],
        query: "Test query",
        appliedFilters: { attractionsOnly: true, query: "Test query" },
        placesToVisit: [
            {
                name: "Test Beach",
                description: "This is a beautiful test beach with amazing views and perfect for sunset watching."
            },
            {
                name: "Test Fort",
                description: "A historic test fort with rich cultural heritage and stunning architecture."
            }
        ],
        resultsCount: 0
    };
    
    res.render("ai/results", testData);
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
        const aiResponse = await convertQueryToFilters(query);
        
        let listings = [];
        let appliedFilters = null;
        let placesToVisit = [];

        if (aiResponse) {
            // Extract filters and places to visit from AI response
            const filters = aiResponse.filters;
            placesToVisit = aiResponse.placesToVisit || [];
            
            console.log("AI Response received:", JSON.stringify(aiResponse, null, 2));
            console.log("Filters extracted:", filters);
            console.log("Places to visit extracted:", placesToVisit);
            console.log("Places to visit type:", typeof placesToVisit);
            console.log("Places to visit is array:", Array.isArray(placesToVisit));
            
            if (filters) {
                
                try {
                    const mongoQuery = buildMongoQuery(filters);
                    console.log("MongoDB query:", JSON.stringify(mongoQuery, null, 2));
                    listings = await Listing.find(mongoQuery).populate('owner');
                    appliedFilters = filters;
                } catch (queryError) {
                    console.error("Error building or executing MongoDB query:", queryError);
                    
                    listings = await performFallbackSearch(query);
                    appliedFilters = { fallback: true, query: query, error: "Query failed, using fallback search" };
                }
            } else {
                
                appliedFilters = { attractionsOnly: true, query: query };
            }
        } else {
            // Fallback to basic keyword search
            listings = await performFallbackSearch(query);
            appliedFilters = { fallback: true, query: query };
        }

        // Ensure placesToVisit is always an array and handle both old and new formats
        if (placesToVisit && placesToVisit.length > 0) {
            console.log("Processing placesToVisit:", placesToVisit);
            placesToVisit = placesToVisit.map(place => {
                console.log("Processing place:", place, "Type:", typeof place);
                if (typeof place === 'string') {
                    // Handle old format (just string names)
                    console.log("Converting string place to object:", place);
                    return { name: place, description: "Popular attraction worth visiting." };
                } else if (place && typeof place === 'object' && place.name) {
                    // Handle new format (objects with name and description)
                    console.log("Using object place:", place);
                    return place;
                } else {
                    // Fallback for malformed data
                    console.log("Fallback for malformed place:", place);
                    return { name: String(place), description: "Popular attraction worth visiting." };
                }
            });
            console.log("Processed placesToVisit:", placesToVisit);
        } else {
            console.log("No placesToVisit found or empty array");
        }

        console.log("Final placesToVisit being sent to template:", placesToVisit);

        res.render("ai/results", { 
            listings, 
            query, 
            appliedFilters,
            placesToVisit,
            resultsCount: listings.length 
        });

    } catch (error) {
        console.error("Error in AI search:", error);
        req.flash("error", "An error occurred while processing your search.");
        res.redirect("/ai/search");
    }
}));

module.exports = router;
