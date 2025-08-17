# AI Travel Concierge Feature

## Overview
The AI Travel Concierge is a smart search feature that allows users to describe their accommodation needs in natural language. The system uses Google's Gemini AI to convert these queries into structured MongoDB filters for precise search results.

## Features
- **Natural Language Processing**: Users can type queries like "I want a 3-day stay near Pune with a private pool, good Wi-Fi, and close to trekking spots under ₹5k/night"
- **Smart Filtering**: AI converts queries to structured filters including location, amenities, price, duration, and activities
- **Fallback Search**: If AI processing fails, the system falls back to keyword-based search
- **Real-time Results**: Displays filtered listings with applied filters clearly shown

## Setup Instructions

### 1. Install Dependencies
```bash
npm install @google/generative-ai
```

### 2. Environment Variables
Add the following to your `.env` file:
```
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Get Gemini API Key
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy the key to your `.env` file

## Usage

### For Users
1. Navigate to `/ai/search` or click "AI Search" in the navbar
2. Enter your accommodation requirements in natural language
3. Click "Find My Perfect Stay"
4. View results with applied filters displayed

### Example Queries
- "I need a luxury villa in Goa with a private beach, spa services, and gourmet kitchen for under ₹15k/night"
- "Looking for a cozy mountain cabin near Manali with fireplace, wifi, and parking for 2 nights under ₹3k/night"
- "Family-friendly apartment in Mumbai with gym, swimming pool, and kitchen facilities under ₹8k/night"
- "Budget-friendly hostel in Delhi with wifi and laundry facilities under ₹1k/night"

## Technical Implementation

### Routes
- `GET /ai/search` - Renders the AI search form
- `POST /ai/search` - Processes the natural language query and returns results

### Files Added/Modified
- `routes/ai.js` - New AI routes
- `views/ai/search.ejs` - AI search form
- `views/ai/results.ejs` - Results display page
- `app.js` - Added AI routes
- `views/includes/navbar.ejs` - Added AI search links

### AI Processing Flow
1. User submits natural language query
2. Query sent to Gemini AI with structured prompt
3. AI returns JSON with MongoDB filters
4. System builds MongoDB query from filters
5. Database queried and results returned
6. If AI fails, fallback to keyword search

### Supported Filters
- **Location**: City/area name
- **Amenities**: wifi, swimmingPool, airConditioning, kitchenFacilities, parkingSpace, laundryFacilities, gym, spaServices, outdoorSpace, conciergeServices
- **Price**: Maximum price per night
- **Duration**: Number of days (for reference)
- **Activities**: Related activities (for reference)

## Error Handling
- Invalid API key handling
- JSON parsing errors
- Fallback to keyword search
- User-friendly error messages

## Styling
The feature uses custom CSS with:
- Modern, responsive design
- Consistent with existing FindYourStay theme
- Interactive elements and hover effects
- Mobile-friendly layout

## Testing
1. Ensure GEMINI_API_KEY is set in environment
2. Test with various natural language queries
3. Verify fallback search works when AI is unavailable
4. Check responsive design on mobile devices
