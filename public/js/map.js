document.addEventListener('DOMContentLoaded', function () {
    console.log('Listing geometry:', listing.geometry.coordinates);

    // Create the map centered on the listing coordinates
    const map = new ol.Map({
        target: 'map', // The ID of the DOM element where the map will be rendered
        layers: [
            new ol.layer.Tile({
                source: new ol.source.OSM() // Use OpenStreetMap as a tile layer
            })
        ],
        view: new ol.View({
            center: ol.proj.fromLonLat(listing.geometry.coordinates), // Convert coordinates to map projection
            zoom: 10 // Set the initial zoom level
        })
    });

    // Create a marker style with a red custom icon
    const markerStyle = new ol.style.Style({
        image: new ol.style.Icon({
            anchor: [0.5, 1], // Center the icon at the bottom
            src: 'https://img.icons8.com/ios-filled/50/ff0000/marker.png', // Use the red marker PNG link
            scale: 0.8 // Adjust the scale to make the icon smaller or larger
        })
    });

    // Create a marker for the listing location
    const marker = new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat(listing.geometry.coordinates)) // Convert coordinates to map projection
    });

    // Apply the marker style to the feature
    marker.setStyle(markerStyle);

    // Create a vector source and layer for the marker
    const vectorSource = new ol.source.Vector({
        features: [marker]
    });

    const markerLayer = new ol.layer.Vector({
        source: vectorSource
    });

    // Add the marker layer to the map
    map.addLayer(markerLayer);
});
