const express = require("express");
const router = express.Router();
const { GoogleGenAI } = require("@google/genai");   // 🔁 CHANGED
const Listing = require("../models/listing");
const wrapAsync = require("../utils/wrapAsync");

// Initialize Gemini AI (NEW SDK)
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

// Function to convert natural language to MongoDB filters using Gemini
async function convertQueryToFilters(userQuery) {
  try {
    if (!ai) {
      console.log("Gemini API key not configured, using fallback search");
      return null;
    }

    // 🔁 CHANGED MODEL + CALL STYLE
    const prompt = `You are TravelBuddy.AI, an intelligent travel assistant that converts natural language travel queries into structured data.

Given a user query, return ONLY a valid JSON object with this schema:

{
  "filters": {
    "location": string,
    "amenities": [ "wifi", "swimmingPool", "airConditioning", "kitchenFacilities", "parkingSpace", "laundryFacilities", "gym", "spaServices", "outdoorSpace", "conciergeServices" ],
    "price": { "$lte": number },
    "duration": number,
    "activities": [string]
  },
  "placesToVisit": [
    {
      "name": "string",
      "description": "string"
    }
  ]
}

Rules:
- If no accommodation search → filters = null
- If no attractions → placesToVisit = []
- Only include price if user mentions budget/cost
- Return ONLY JSON

User query: "${userQuery}"
`;

    // 🔁 NEW SDK CALL
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = response.text;

    // Clean markdown if present
    let cleanText = text.trim();
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    } else if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```\s*/i, "").replace(/\s*```$/, "");
    }

    const parsedFilters = JSON.parse(cleanText);
    console.log("Gemini returned filters:", parsedFilters);

    // Validate location
    if (
      parsedFilters.filters &&
      parsedFilters.filters.location &&
      typeof parsedFilters.filters.location !== "string"
    ) {
      if (
        parsedFilters.filters.location.$in &&
        Array.isArray(parsedFilters.filters.location.$in)
      ) {
        parsedFilters.filters.location =
          parsedFilters.filters.location.$in[0];
      } else if (typeof parsedFilters.filters.location === "object") {
        parsedFilters.filters.location = JSON.stringify(
          parsedFilters.filters.location
        );
      }
    }

    return parsedFilters;

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return null;
  }
}

// --------------------
// REST OF YOUR FILE
// --------------------
// (everything below is UNCHANGED)

function buildMongoQuery(filters) {
  if (!filters) return {};

  const query = {};

  if (filters.location) {
    if (typeof filters.location === "string") {
      query.$or = [
        { location: { $regex: filters.location, $options: "i" } },
        { country: { $regex: filters.location, $options: "i" } },
      ];
    } else if (filters.location.$in && Array.isArray(filters.location.$in)) {
      const locationQueries = [];
      filters.location.$in.forEach((loc) => {
        if (typeof loc === "string") {
          locationQueries.push(
            { location: { $regex: loc, $options: "i" } },
            { country: { $regex: loc, $options: "i" } }
          );
        }
      });
      if (locationQueries.length > 0) query.$or = locationQueries;
    } else if (filters.location.$regex) {
      query.$or = [{ location: filters.location }, { country: filters.location }];
    }
  }

  if (filters.price && filters.price.$lte) {
    query.price = { $lte: filters.price.$lte };
  }

  if (filters.amenities && filters.amenities.length > 0) {
    const amenityQueries = filters.amenities.map((amenity) => ({
      [`amenities.${amenity}`]: true,
    }));
    query.$and = query.$and || [];
    query.$and.push({ $or: amenityQueries });
  }

  return query;
}

async function performFallbackSearch(userQuery) {
  const searchQuery = {
    $or: [
      { title: { $regex: userQuery, $options: "i" } },
      { location: { $regex: userQuery, $options: "i" } },
      { country: { $regex: userQuery, $options: "i" } },
      { description: { $regex: userQuery, $options: "i" } },
    ],
  };

  return await Listing.find(searchQuery).populate("owner");
}

router.get("/search", (req, res) => {
  res.render("ai/search");
});

router.get("/test-attractions", (req, res) => {
  const testData = {
    listings: [],
    query: "Test query",
    appliedFilters: { attractionsOnly: true, query: "Test query" },
    placesToVisit: [
      {
        name: "Test Beach",
        description:
          "This is a beautiful test beach with amazing views and perfect for sunset watching.",
      },
      {
        name: "Test Fort",
        description:
          "A historic test fort with rich cultural heritage and stunning architecture.",
      },
    ],
    resultsCount: 0,
  };

  res.render("ai/results", testData);
});

router.post(
  "/search",
  wrapAsync(async (req, res) => {
    const { query } = req.body;

    if (!query || query.trim() === "") {
      req.flash("error", "Please enter a search query.");
      return res.redirect("/ai/search");
    }

    try {
      const aiResponse = await convertQueryToFilters(query);

      let listings = [];
      let appliedFilters = null;
      let placesToVisit = [];

      if (aiResponse) {
        const filters = aiResponse.filters;
        placesToVisit = aiResponse.placesToVisit || [];

        if (filters) {
          try {
            const mongoQuery = buildMongoQuery(filters);
            listings = await Listing.find(mongoQuery).populate("owner");
            appliedFilters = filters;
          } catch (queryError) {
            listings = await performFallbackSearch(query);
            appliedFilters = {
              fallback: true,
              query,
              error: "Query failed, using fallback search",
            };
          }
        } else {
          appliedFilters = { attractionsOnly: true, query };
        }
      } else {
        listings = await performFallbackSearch(query);
        appliedFilters = { fallback: true, query };
      }

      if (placesToVisit && placesToVisit.length > 0) {
        placesToVisit = placesToVisit.map((place) => {
          if (typeof place === "string") {
            return {
              name: place,
              description: "Popular attraction worth visiting.",
            };
          } else if (place && typeof place === "object" && place.name) {
            return place;
          } else {
            return {
              name: String(place),
              description: "Popular attraction worth visiting.",
            };
          }
        });
      }

      res.render("ai/results", {
        listings,
        query,
        appliedFilters,
        placesToVisit,
        resultsCount: listings.length,
      });
    } catch (error) {
      console.error("Error in AI search:", error);
      req.flash("error", "An error occurred while processing your search.");
      res.redirect("/ai/search");
    }
  })
);

module.exports = router;
