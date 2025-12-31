# Pipeline Map Setup Guide

## 1. Install Dependencies

```bash
cd ~/Documents/"Inspection App and Dashboard"
npm install leaflet react-leaflet
```

## 2. Add Leaflet CSS

Add this line to your `index.html` in the `<head>` section:

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
```

Or if you prefer importing in your React code, the component already includes:
```javascript
import 'leaflet/dist/leaflet.css'
```

## 3. Copy the Component Files

```bash
cp ~/Downloads/PipelineMap.jsx ~/Documents/"Inspection App and Dashboard"/src/
cp ~/Downloads/MapDashboard.jsx ~/Documents/"Inspection App and Dashboard"/src/
```

## 4. Add Route in main.jsx

Add the map dashboard route:

```jsx
import MapDashboard from './MapDashboard.jsx'

// In your routes:
<Route path="/map" element={
  <ProtectedRoute>
    <MapDashboard />
  </ProtectedRoute>
} />
```

## 5. Add Navigation Link (Optional)

Add a button to navigate to the map from your dashboard:

```jsx
<button onClick={() => navigate('/map')}>
  🗺️ Pipeline Map
</button>
```

---

## Features Included

### 🗺️ Map Views
- **Satellite** (default) - Best for field verification
- **Street** - Road names and landmarks
- **Terrain** - Topographic features

### 📍 Pipeline Routes
- **Southern Route**: Edmonton → Calgary (280km)
- **Northern Route**: Edmonton → Fort McMurray (350km)

### ⚙️ Functionality
- **Click-to-KP**: Click anywhere to find nearest Kilometre Post
- **GPS Location**: Show inspector's current position
- **ROW Buffer**: 30m right-of-way visualization
- **KP Markers**: Every 20km along the route

### 🎯 Use Cases
1. **Field Verification**: Inspector can verify they're on the correct ROW
2. **KP Lookup**: Quick way to determine chainage from GPS
3. **Route Planning**: Visualize pipeline corridors
4. **Demo Purposes**: Impressive visual for stakeholder presentations

---

## Customization

### Change Pipeline Routes

Edit the `demoPipelineRoute` and `northernPipelineRoute` arrays in `PipelineMap.jsx`:

```javascript
const demoPipelineRoute = [
  { lat: 53.5461, lon: -113.4938, kp: 0 },      // Start point
  { lat: 52.2700, lon: -113.8100, kp: 140 },    // Waypoint
  { lat: 51.0447, lon: -114.0719, kp: 280 }     // End point
]
```

### Change KP Interval

```jsx
<PipelineMap 
  kpInterval={10}  // Show marker every 10km instead of 20km
/>
```

### Adjust ROW Width

In `PipelineMap.jsx`, change the Circle radius:

```javascript
<Circle
  radius={50}  // 50m instead of 30m
  ...
/>
```

---

## Tile Provider Options

The component uses Esri satellite tiles (free, no API key needed). If you want other providers:

### MapBox (requires API key)
```javascript
satellite: {
  url: 'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=YOUR_TOKEN',
  attribution: '© Mapbox'
}
```

### Google (requires API key)
```javascript
satellite: {
  url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  attribution: '© Google'
}
```

---

## Future Enhancements

- [ ] Real-time inspector tracking
- [ ] Historical activity overlays
- [ ] Weather layer integration
- [ ] Offline map caching
- [ ] KP validation warnings in report form
