# What3Words API Setup

## Current Status
The What3Words API is currently not configured with a valid API key. The app will function normally, but some location features will be limited to coordinates only.

## To Enable What3Words Features

1. **Get a What3Words API Key**:
   - Visit https://developer.what3words.com/
   - Sign up for a free developer account
   - Create a new API key

2. **Configure the API Key**:
   - Open the `.env` file in the root directory
   - Replace `your_actual_api_key_here` with your actual API key:
   ```
   VITE_WHAT3WORDS_API_KEY=your_actual_api_key_here
   ```

3. **Restart the Development Server**:
   ```bash
   npm run dev
   ```

## Features Enabled with What3Words API

With a valid API key, the following features will be available:

### ✅ Current Features (without API key):
- Basic coordinate input and display
- Emergency location sharing with coordinates
- Map-based location selection

### 🔓 Enhanced Features (with API key):
- Convert coordinates to what3words addresses (e.g., `///filled.count.soap`)
- Convert what3words addresses back to coordinates
- Auto-suggestions for what3words input
- Enhanced emergency location sharing with memorable addresses
- Voice-friendly location descriptions

## Error Handling

The app is designed to gracefully handle:
- Missing API keys
- Invalid/expired API keys
- Network connectivity issues
- API service outages

When What3Words is unavailable, the app falls back to:
- Standard coordinate display (latitude, longitude)
- Basic location services
- Full functionality without what3words features

## Development Notes

The What3Words service includes:
- Automatic API key validation
- Intelligent caching (5-minute expiry)
- Graceful fallback modes
- Debug logging for troubleshooting

No code changes are required - just add a valid API key to enable enhanced features.