// Update pipelineLocations to include EGP
sed -i '' "s/export const pipelineLocations = {/export const pipelineLocations = {\n  'EGP Mainline': { lat: 49.3163, lon: -123.0693, name: 'Squamish, BC' },\n  'EGP Coastal': { lat: 49.2827, lon: -123.1207, name: 'Vancouver, BC' },/" constants.js
