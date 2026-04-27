/*
Gen AI use acknowledgement

I acknowledge the use of ChatGPT-5.4 (OpenAI, https://chat.openai.com/, accessed through the Codex extension in VS Code) to support parts of this project
ChatGPT-5.4 was used to explain coding logic, clarify technical principles, suggest possible solutions, and assist with troubleshooting and web page testing during the development process
The project was developed based on my existing programming skills, while ChatGPT-5.4 was used to provide conceptual support for some functions, features, and coding structures that were new to me

In terms of data processing and functional development, ChatGPT-5.4 helped me refine the structure and functionality of the web page
This included support in the following areas
- converting CSV data into JavaScript format
- support in applying boundary data
- suggesting solutions when the apartment data and information cards were not synchronised
- providing guidance on the implementation of external link navigation
- explaining the function logic behind distance calculation, weighted scoring, and result ranking
- helping me check whether any fields were undefined while I was writing the code
- reviewing the code logic to ensure that the web page could run properly
- suggesting possible solutions when coding errors occurred
*/


// 1. Shared data and defaults
// 1.1 Apartment and boundary data
// Define rawData to store a safe copy of the original apartment data
const rawData = Array.isArray(window.APARTMENT_DATA)
    ? window.APARTMENT_DATA.map((apartment) => ({ ...apartment })) // Clone each apartment object before scoring
    : []; // Use an empty array if the data source is missing

// Clean campus boundary coordinates before drawing the polygon
const universityBoundaryCoords = Array.isArray(window.UNIVERSITY_BOUNDARY_COORDS)
    ? window.UNIVERSITY_BOUNDARY_COORDS
        .filter((coord) => Array.isArray(coord) && coord.length === 2)
        .map(([lat, lng]) => [Number(lat), Number(lng)])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
    : [];

// 1.2 Ranking and marker defaults
// Store the slider ids used by the ranking form
const sliderIds = ["dist", "price", "rating", "year"];
// Set equal starting weights for each ranking factor
const sliderDefaults = { dist: 3, price: 3, rating: 3, year: 3 };
// Limit the sidebar list to the top five apartments
const recommendationCount = 5;

// Control how long marker highlight animations stay visible
const highlightFlashDurationMs = 1300;
const targetFlashDurationMs = 1150;

// Store the default target buffer and initial Leeds map view
const targetRadiusMeters = 300;
const defaultMapView = { center: [53.805, -1.554], zoom: 14 };
// Keep popup spacing consistent across marker types
const popupLayout = {
    offset: [18, -6],
    paddingTopLeft: [24, 24],
    paddingBottomRight: [24, 122]
};

// 1.3 Marker icon configuration
// Keep shared marker icon paths in one lookup object
const iconPaths = {
    apartment: "icon/icon_house.png",
    school: "icon/icon_school.png",
    shopping: "icon/icon_shopping.png",
    train: "icon/icon_train.png",
    airport: "icon/icon_airport.png"
};

// Store one icon recipe per marker variant
function buildMarkerConfig(iconUrl, buttonSize, imageSize, className, iconAnchor, popupAnchor) {
    return {
        iconUrl,
        buttonSize,
        imageSize,
        className,
        iconAnchor,
        popupAnchor
    };
}

// Define the size, anchor, and classes for each marker icon
const markerIconConfig = {
    apartment: buildMarkerConfig(
        iconPaths.apartment,
        28,
        16,
        "map-marker-button apartment-marker",
        [14, 14],
        [0, -16]
    ),
    apartmentHighlighted: buildMarkerConfig(
        iconPaths.apartment,
        28,
        16,
        "map-marker-button apartment-marker top-ranked-marker",
        [14, 14],
        [0, -16]
    ),
    schoolLarge: buildMarkerConfig(
        iconPaths.school,
        36,
        20,
        "map-marker-button target-marker school-marker",
        [18, 18],
        [0, -20]
    ),
    shoppingLarge: buildMarkerConfig(
        iconPaths.shopping,
        36,
        20,
        "map-marker-button target-marker shopping-marker",
        [18, 18],
        [0, -20]
    ),
    trainLarge: buildMarkerConfig(
        iconPaths.train,
        36,
        20,
        "map-marker-button target-marker train-marker",
        [18, 18],
        [0, -20]
    ),
    airportLarge: buildMarkerConfig(
        iconPaths.airport,
        38,
        21,
        "map-marker-button target-marker airport-marker",
        [19, 19],
        [0, -22]
    )
};

// 1.4 Score ranges and app state
// Precompute data ranges used by score normalization
const stats = {
    priceMin: Math.min(...rawData.map((d) => d.price_low)),
    priceMax: Math.max(...rawData.map((d) => d.price_low)),
    ratingMin: Math.min(...rawData.map((d) => d.rating)),
    ratingMax: Math.max(...rawData.map((d) => d.rating)),
    yearMin: Math.min(...rawData.map((d) => d.renovation_year)),
    yearMax: Math.max(...rawData.map((d) => d.renovation_year))
};
// Define the radar chart axes and label positions
const scoreRadarAxes = [
    { key: "distance", label: "Distance", shortLabel: "Dist", angle: -90, anchor: "middle", dx: 0, dy: -4 },
    { key: "price", label: "Price", shortLabel: "Price", angle: 0, anchor: "start", dx: 7, dy: 3 },
    { key: "rating", label: "Rating", shortLabel: "Rating", angle: 90, anchor: "middle", dx: 0, dy: 13 },
    { key: "year", label: "Year", shortLabel: "Year", angle: 180, anchor: "end", dx: -7, dy: 3 }
];

// Store mutable map and ranking state during interaction
let map = null;
let mapMarkers = [];
let targetMarker = null;
let targetRadiusCircle = null;
let universityBoundary = null;
let currentScoredData = [];
let currentTargetMeta = null;
let appliedWeights = { ...sliderDefaults };

// 2. Marker and map helpers
// 2.1 Marker icon helpers
// Build a Leaflet div icon from the stored marker configuration
function createMarkerIcon(iconKey) {
    const config = markerIconConfig[iconKey];

    return L.divIcon({
        className: "map-marker-shell",
        iconSize: [config.buttonSize, config.buttonSize],
        iconAnchor: config.iconAnchor,
        popupAnchor: config.popupAnchor,
        html: `
            <div class="${config.className}" style="width:${config.buttonSize}px;height:${config.buttonSize}px;">
                <img src="${config.iconUrl}" alt="" style="width:${config.imageSize}px;height:${config.imageSize}px;">
            </div>
        `
    });
}

// Toggle a class on the marker button
function setMarkerVisualState(marker, markerSelector, className, isActive) {
    const markerButton = marker?.getElement()?.querySelector(markerSelector);
    if (!markerButton) {
        return;
    }

    markerButton.classList.toggle(className, isActive);
}

// Keep marker color in sync with popup visibility
function bindMarkerActivePopupState(marker) {
    if (!marker) {
        return;
    }

    marker.on("popupopen", () => {
        setMarkerVisualState(marker, ".map-marker-button", "map-marker-active", true);
    });

    marker.on("popupclose", () => {
        setMarkerVisualState(marker, ".map-marker-button", "map-marker-active", false);
    });
}

// 2.2 Target metadata helpers
// Read the active target from the select box
function getSelectedTargetMeta() {
    const selector = document.getElementById("target-selector");
    const selectedOption = selector.options[selector.selectedIndex];
    const [lat, lng] = selectedOption.value.split(",").map(Number);

    return {
        lat,
        lng,
        label: selectedOption.textContent,
        category: selectedOption.dataset.category || "school"
    };
}

// Restore the default target option
function resetTargetSelector() {
    const selector = document.getElementById("target-selector");
    const defaultOption = Array.from(selector.options).find((option) => option.defaultSelected) || selector.options[0];

    if (defaultOption) {
        selector.value = defaultOption.value;
    }
}

// Label the active target category
function getCategoryLabel(category) {
    const labels = {
        school: "University destination",
        shopping: "Shopping destination",
        train: "Transport destination",
        airport: "Travel destination"
    };

    return labels[category] || "Selected destination";
}

// Pick the target popup icon
function getTargetIconUrl(category) {
    if (category === "shopping") {
        return iconPaths.shopping;
    }

    if (category === "train") {
        return iconPaths.train;
    }

    if (category === "airport") {
        return iconPaths.airport;
    }

    return iconPaths.school;
}

// 2.3 Popup options and boundary layer
// Share popup spacing in one place
function buildPopupOptions(className, minWidth, maxWidth) {
    return {
        className,
        minWidth,
        maxWidth,
        keepInView: true,
        offset: L.point(...popupLayout.offset),
        autoPanPaddingTopLeft: L.point(...popupLayout.paddingTopLeft),
        autoPanPaddingBottomRight: L.point(...popupLayout.paddingBottomRight)
    };
}

// Draw the campus outline layer
function drawUniversityBoundary() {
    if (!map || !universityBoundaryCoords.length) {
        return;
    }

    if (universityBoundary) {
        map.removeLayer(universityBoundary);
    }

    universityBoundary = L.polygon(universityBoundaryCoords, {
        pane: "boundaryPane",
        color: "#2e67ba",
        weight: 2.5,
        opacity: 0.92,
        dashArray: "10 8",
        fillColor: "#2e67ba",
        fillOpacity: 0.04,
        interactive: false
    }).addTo(map);
}

// Popup size for apartment markers
function getSidePopupOptions() {
    return buildPopupOptions("side-popup", 296, 348);
}

// Popup size for target markers
function getTargetPopupOptions() {
    return buildPopupOptions("side-popup target-popup", 214, 248);
}

// 2.4 Popup focus and fallback messages
// Keep the clicked popup inside the map view
function focusMarkerWithPopup(marker, lat, lng, options = {}) {
    if (!map || !marker) {
        return;
    }

    const { zoom = null } = options;

    let opened = false;
    const finalize = () => {
        if (opened) {
            return;
        }

        opened = true;
        marker.openPopup();

        const popup = marker.getPopup();
        if (popup) {
            popup.update();
        }
    };

    const targetZoom = Number.isFinite(zoom) ? zoom : null;
    if (targetZoom !== null && targetZoom !== map.getZoom()) {
        // Open the popup after the map settles so the full card stays in view
        map.once("moveend", () => {
            window.setTimeout(finalize, 40);
        });

        map.flyTo([lat, lng], targetZoom, {
            duration: 0.8
        });

        window.setTimeout(finalize, 920);
        return;
    }

    finalize();
    map.panInside(L.latLng(lat, lng), {
        paddingTopLeft: L.point(...popupLayout.paddingTopLeft),
        paddingBottomRight: L.point(...popupLayout.paddingBottomRight),
        animate: true
    });

    window.setTimeout(() => {
        const popup = marker.getPopup();
        if (popup) {
            popup.update();
        }
    }, 180);
}

// Show a readable message if Leaflet fails to load
function showLeafletLoadError() {
    const mapEl = document.getElementById("map");
    mapEl.innerHTML = `
        <div class="map-status">
            <div class="map-status-card">
                <h3 class="map-status-title">Leaflet could not be loaded</h3>
                <p class="map-status-copy">
                    The page logic is ready, but the Leaflet library did not load from the CDN.
                    Please check your internet connection or replace the CDN files with local Leaflet assets.
                </p>
            </div>
        </div>
    `;
}

// Show a simple empty-data message
function showDataLoadError() {
    document.getElementById("recommendation-list").innerHTML = `
        <article class="apt-card">
            <div class="apt-card-head">
                <div>
                    <div class="apt-rank">Notice</div>
                    <h4 class="apt-title">No apartment records available</h4>
                </div>
            </div>
        </article>
    `;
}

// 3. Map setup and scoring utilities
// 3.1 Leaflet map initialization
// Initialize the Leaflet map, tile layer, controls, and boundary
function initMap() {
    map = L.map("map", {
        zoomControl: false
    }).setView(defaultMapView.center, defaultMapView.zoom);

    map.createPane("boundaryPane");
    map.getPane("boundaryPane").style.zIndex = "360";

    L.control.zoom({
        position: "bottomleft"
    }).addTo(map);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 20
    }).addTo(map);

    // Close popups when the user starts dragging the map while leaving zoom actions untouched
    map.on("dragstart", () => {
        map.closePopup();
    });

    drawUniversityBoundary();
    window.setTimeout(() => map.invalidateSize(), 0);
    window.addEventListener("resize", () => map.invalidateSize());
}

// 3.2 Distance and value normalization
// Measure straight-line distance in meters
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
        * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Normalize values where higher is better
function normalizeBenefit(value, min, max) {
    if (max === min) {
        return 1;
    }

    return (value - min) / (max - min);
}

// Normalize values where lower is better
function normalizeCost(value, min, max) {
    if (max === min) {
        return 1;
    }

    return (max - value) / (max - min);
}

// 3.3 Text formatting helpers
// Format meters or kilometers for display
function formatDistance(distanceMeters) {
    if (distanceMeters < 1000) {
        return `${Math.round(distanceMeters)} m`;
    }

    return `${(distanceMeters / 1000).toFixed(2)} km`;
}

// Format the review count label
function formatReviewCount(reviewCount) {
    if (!Number.isFinite(reviewCount) || reviewCount < 0) {
        return "";
    }

    const reviewLabel = reviewCount === 1 ? "review" : "reviews";
    return `(${reviewCount} ${reviewLabel})`;
}

// Format a full rating string
function formatRatingWithReviews(apartment) {
    const reviewCount = Number(apartment.rating_num);
    const baseRating = `${apartment.rating.toFixed(1)}/5`;
    const reviewText = formatReviewCount(reviewCount);
    return reviewText ? `${baseRating} ${reviewText}` : baseRating;
}

// Split rating text over two lines in cards
function renderRecommendationRating(apartment) {
    const baseRating = `Rating ${apartment.rating.toFixed(1)}/5`;
    const reviewText = formatReviewCount(Number(apartment.rating_num));

    if (!reviewText) {
        return baseRating;
    }

    return `${baseRating}<span class="meta-pill-subline">${reviewText}</span>`;
}

// 4. Rendering helpers
// 4.1 Target and bounds helpers
// Use a wider zoom for larger travel targets
function getTargetZoom(category) {
    if (category === "airport") {
        return 11;
    }

    if (category === "train") {
        return 14;
    }

    return 15;
}

// Build bounds for target, apartments, and outline
function buildBoundsFromResults(scoredData, targetMeta) {
    if (!targetMeta) {
        return null;
    }

    const bounds = L.latLngBounds([[targetMeta.lat, targetMeta.lng]]);
    scoredData.forEach((apt) => bounds.extend([apt.lat, apt.lng]));
    universityBoundaryCoords.forEach(([lat, lng]) => bounds.extend([lat, lng]));

    return bounds;
}

// 4.2 Slider and weight helpers
// Mirror slider values into the small badges
function updateSliderLabels() {
    sliderIds.forEach((key) => {
        document.getElementById(`val-${key}`).textContent = document.getElementById(`w-${key}`).value;
    });
}

// Read the active weight sliders
function getWeights() {
    return {
        dist: Number(document.getElementById("w-dist").value),
        price: Number(document.getElementById("w-price").value),
        rating: Number(document.getElementById("w-rating").value),
        year: Number(document.getElementById("w-year").value)
    };
}

// 4.3 Radar chart drawing
// Set the radar chart outer scale
function getRadarScaleMax() {
    const weightValues = [appliedWeights.dist, appliedWeights.price, appliedWeights.rating, appliedWeights.year];
    const totalWeight = weightValues.reduce((sum, value) => sum + value, 0);
    const maxContribution = (Math.max(...weightValues) / totalWeight) * 100;

    if (maxContribution <= 25) {
        return 25;
    }

    if (maxContribution <= 40) {
        return 40;
    }

    return Math.ceil(maxContribution / 10) * 10;
}

// Plot one point on the radar shape
function getRadarPoint(center, radius, angle, value, scaleMax) {
    const ratio = Math.max(0, Math.min(value / scaleMax, 1));
    const radians = angle * Math.PI / 180;

    return {
        x: center + radius * ratio * Math.cos(radians),
        y: center + radius * ratio * Math.sin(radians)
    };
}

// Plot one point on the radar axis
function getAxisPoint(center, radius, angle) {
    const radians = angle * Math.PI / 180;

    return {
        x: center + radius * Math.cos(radians),
        y: center + radius * Math.sin(radians)
    };
}

// Render the weighted radar chart
function renderScoreRadar(apartment, variant = "card") {
    const size = variant === "popup" ? 170 : 148;
    const center = size / 2;
    const outerRadius = variant === "popup" ? 48 : 42;
    const labelRadius = outerRadius + (variant === "popup" ? 18 : 14);
    const scaleMax = getRadarScaleMax();
    const labelKey = variant === "popup" ? "label" : "shortLabel";
    const polygonPoints = scoreRadarAxes.map((axis) => {
        const point = getRadarPoint(center, outerRadius, axis.angle, apartment.scoreBreakdown[axis.key], scaleMax);
        return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    }).join(" ");

    const axisLines = scoreRadarAxes.map((axis) => {
        const point = getAxisPoint(center, outerRadius, axis.angle);
        return `<line class="score-radar-axis" x1="${center}" y1="${center}" x2="${point.x.toFixed(2)}" y2="${point.y.toFixed(2)}"></line>`;
    }).join("");

    const rings = [0.25, 0.5, 0.75, 1].map((ratio) => `
        <circle class="score-radar-ring" cx="${center}" cy="${center}" r="${(outerRadius * ratio).toFixed(2)}"></circle>
    `).join("");

    const labels = scoreRadarAxes.map((axis) => {
        const point = getAxisPoint(center, labelRadius, axis.angle);
        return `
            <text
                class="score-radar-label"
                x="${(point.x + axis.dx).toFixed(2)}"
                y="${(point.y + axis.dy).toFixed(2)}"
                text-anchor="${axis.anchor}"
            >${axis[labelKey]}</text>
        `;
    }).join("");

    const points = scoreRadarAxes.map((axis) => {
        const point = getRadarPoint(center, outerRadius, axis.angle, apartment.scoreBreakdown[axis.key], scaleMax);
        return `<circle class="score-radar-point" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${variant === "popup" ? "2.8" : "2.4"}"></circle>`;
    }).join("");

    return `
        <div class="score-radar score-radar-${variant}" aria-label="Weighted score profile">
            <svg class="score-radar-svg" viewBox="0 0 ${size} ${size}" role="img" aria-hidden="true">
                ${rings}
                ${axisLines}
                <polygon class="score-radar-area" points="${polygonPoints}"></polygon>
                ${points}
                ${labels}
            </svg>
        </div>
    `;
}

// 4.4 Website and popup HTML
// Render the external website button
function renderWebsiteLink(url, extraClass = "") {
    if (typeof url !== "string" || !url.trim()) {
        return "";
    }

    const classSuffix = extraClass ? ` ${extraClass}` : "";
    return `
        <a class="website-link${classSuffix}" href="${url}" target="_blank" rel="noopener noreferrer">
            <span class="website-link-icon" aria-hidden="true">-&gt;</span>
            <span>Check Website</span>
        </a>
    `;
}

// Render the popup for target markers
function renderTargetPopup(targetMeta) {
    return `
        <div class="popup-card popup-card-target">
            <div class="popup-main popup-main-target">
                <div class="popup-target-head">
                    <span class="popup-target-icon-shell" aria-hidden="true">
                        <img class="popup-target-icon" src="${getTargetIconUrl(targetMeta.category)}" alt="">
                    </span>
                    <div class="popup-target-copy">
                        <div class="match-badge popup-badge-target">Selected target</div>
                        <h3>${targetMeta.label}</h3>
                    </div>
                </div>
                <p class="popup-target-description">${getCategoryLabel(targetMeta.category)}</p>
            </div>
        </div>
    `;
}

// Render the popup for apartment markers
function renderApartmentPopup(apartment) {
    return `
        <div class="popup-card popup-card-apartment">
            <div class="popup-main">
                <div class="match-badge">Match ${apartment.matchScore.toFixed(1)} / 100</div>
                <h3>${apartment.name}</h3>
                <div class="popup-meta-list">
                    <div class="popup-meta-item">
                        <span>Postcode</span>
                        <strong>${apartment.postcode}</strong>
                    </div>
                    <div class="popup-meta-item">
                        <span>Distance</span>
                        <strong>${formatDistance(apartment.dynamicDist)}</strong>
                    </div>
                </div>
                <div class="popup-website-block">
                    <div class="popup-website-note">If you want to know more...</div>
                    ${renderWebsiteLink(apartment.url, "website-link-popup")}
                </div>
            </div>
            <div class="popup-side">
                <div class="popup-stat-grid">
                    <div class="popup-stat">
                        <span>Weekly rent</span>
                        <strong>GBP ${apartment.price_low}</strong>
                    </div>
                    <div class="popup-stat">
                        <span>User rating</span>
                        <strong class="popup-stat-value-rating">${formatRatingWithReviews(apartment)}</strong>
                    </div>
                    <div class="popup-stat">
                        <span>Renovation year</span>
                        <strong>${apartment.renovation_year}</strong>
                    </div>
                </div>
                <div class="popup-breakdown">
                    <div class="score-radar-caption">Weighted profile</div>
                    ${renderScoreRadar(apartment, "popup")}
                </div>
            </div>
        </div>
    `;
}

// 4.5 Marker feedback effects
// Remove old markers before redrawing
function clearMarkers() {
    mapMarkers.forEach((marker) => map.removeLayer(marker));
    mapMarkers = [];
}

// Briefly pulse the top-ranked markers after the user refreshes results
function flashHighlightedMarkers(markers) {
    if (!Array.isArray(markers) || markers.length === 0) {
        return;
    }

    window.requestAnimationFrame(() => {
        markers.forEach((marker) => {
            const markerButton = marker.getElement()?.querySelector(".top-ranked-marker");
            if (!markerButton) {
                return;
            }

            markerButton.classList.add("top-ranked-marker-flash");

            window.setTimeout(() => {
                markerButton.classList.remove("top-ranked-marker-flash");
            }, highlightFlashDurationMs);
        });
    });
}

// Briefly pulse the active target marker when the location changes
function flashTargetMarker(marker) {
    if (!marker) {
        return;
    }

    window.requestAnimationFrame(() => {
        const markerButton = marker.getElement()?.querySelector(".target-marker");
        if (!markerButton) {
            return;
        }

        markerButton.classList.add("target-marker-flash");

        window.setTimeout(() => {
            markerButton.classList.remove("target-marker-flash");
        }, targetFlashDurationMs);
    });
}

// 5. Recommendation and marker rendering
// 5.1 Recommendation cards
// Render the top-ranked recommendation cards
function renderRecommendations(sortedData) {
    const container = document.getElementById("recommendation-list");
    container.innerHTML = "";

    sortedData.slice(0, recommendationCount).forEach((apt, index) => {
        const card = document.createElement("article");
        card.className = "apt-card";
        card.innerHTML = `
            <div class="apt-card-layout">
                <div class="apt-card-main">
                    <div class="apt-card-head">
                        <div class="apt-rank">Rank ${index + 1}</div>
                        <h4 class="apt-title">${apt.name}</h4>
                    </div>
                    <div class="apt-meta">
                        <span class="meta-pill">GBP ${apt.price_low}/week</span>
                        <span class="meta-pill meta-pill-rating">${renderRecommendationRating(apt)}</span>
                        <span class="meta-pill">${formatDistance(apt.dynamicDist)} away</span>
                        <span class="meta-pill">Updated ${apt.renovation_year}</span>
                    </div>
                </div>
                <div class="apt-card-side">
                    <div class="apt-score">
                        <strong>${apt.matchScore.toFixed(0)}</strong>
                        <span>Score</span>
                    </div>
                    <div class="apt-breakdown">
                        <div class="score-radar-caption">Weighted profile</div>
                        ${renderScoreRadar(apt, "card")}
                    </div>
                </div>
            </div>
        `;

        card.addEventListener("click", () => {
            if (apt.marker) {
                focusMarkerWithPopup(apt.marker, apt.lat, apt.lng);
            }
        });

        container.appendChild(card);
    });
}

// 5.2 Target and apartment markers
// Render the target and apartment markers
function renderMarkers(sortedData, targetMeta, options = {}) {
    const { flashHighlights = false, flashTarget = false } = options;
    clearMarkers();

    if (targetMarker) {
        map.removeLayer(targetMarker);
    }

    if (targetRadiusCircle) {
        map.removeLayer(targetRadiusCircle);
    }

    targetRadiusCircle = L.circle([targetMeta.lat, targetMeta.lng], {
        radius: targetRadiusMeters,
        color: "#b1a2eb",
        weight: 1.5,
        opacity: 0.8,
        fillColor: "#b1a2eb",
        fillOpacity: 0.12,
        className: "target-radius-circle"
    }).addTo(map);

    targetMarker = L.marker([targetMeta.lat, targetMeta.lng], {
        icon: createMarkerIcon(`${targetMeta.category}Large`),
        zIndexOffset: 1000
    }).addTo(map);

    targetMarker.bindPopup(renderTargetPopup(targetMeta), getTargetPopupOptions());
    targetMarker.on("click", () => {
        focusMarkerWithPopup(targetMarker, targetMeta.lat, targetMeta.lng, {
            zoom: getTargetZoom(targetMeta.category)
        });
    });
    bindMarkerActivePopupState(targetMarker);

    if (flashTarget) {
        flashTargetMarker(targetMarker);
    }

    const highlightedMarkers = [];

    sortedData.forEach((apt, index) => {
        const isHighlighted = index < recommendationCount;
        const marker = L.marker([apt.lat, apt.lng], {
            icon: createMarkerIcon(isHighlighted ? "apartmentHighlighted" : "apartment"),
            zIndexOffset: isHighlighted ? 900 - index : 0
        }).addTo(map);

        marker.bindPopup(renderApartmentPopup(apt), getSidePopupOptions());

        marker.on("click", () => {
            focusMarkerWithPopup(marker, apt.lat, apt.lng);
        });
        bindMarkerActivePopupState(marker);

        apt.marker = marker;
        mapMarkers.push(marker);

        if (isHighlighted) {
            highlightedMarkers.push(marker);
        }
    });

    if (flashHighlights) {
        flashHighlightedMarkers(highlightedMarkers);
    }
}

// 6. Ranking workflow and actions
// 6.1 MCDA scoring
// Recompute scores and refresh the UI
function calculateMCDA(options = {}) {
    const { recenter = false, flashHighlights = false, flashTarget = false } = options;
    const targetMeta = getSelectedTargetMeta();
    const weights = appliedWeights;
    const weightSum = weights.dist + weights.price + weights.rating + weights.year;

    // Recompute distance against the active target before scoring
    rawData.forEach((apt) => {
        apt.dynamicDist = getDistance(apt.lat, apt.lng, targetMeta.lat, targetMeta.lng);
    });

    const distMin = Math.min(...rawData.map((d) => d.dynamicDist));
    const distMax = Math.max(...rawData.map((d) => d.dynamicDist));

    const scoredData = rawData.map((apt) => {
        const distanceScore = normalizeCost(apt.dynamicDist, distMin, distMax);
        const priceScore = normalizeCost(apt.price_low, stats.priceMin, stats.priceMax);
        const ratingScore = normalizeBenefit(apt.rating, stats.ratingMin, stats.ratingMax);
        const yearScore = normalizeBenefit(apt.renovation_year, stats.yearMin, stats.yearMax);

        const weightedScore = (
            distanceScore * weights.dist +
            priceScore * weights.price +
            ratingScore * weights.rating +
            yearScore * weights.year
        ) / weightSum;

        const scoreBreakdown = {
            distance: (distanceScore * weights.dist / weightSum) * 100,
            price: (priceScore * weights.price / weightSum) * 100,
            rating: (ratingScore * weights.rating / weightSum) * 100,
            year: (yearScore * weights.year / weightSum) * 100
        };

        return {
            ...apt,
            matchScore: weightedScore * 100,
            scoreBreakdown
        };
    }).sort((a, b) => b.matchScore - a.matchScore);

    currentTargetMeta = targetMeta;
    currentScoredData = scoredData;
    renderMarkers(scoredData, targetMeta, { flashHighlights, flashTarget });
    renderRecommendations(scoredData);

    if (recenter) {
        map.setView([targetMeta.lat, targetMeta.lng], getTargetZoom(targetMeta.category), {
            animate: false
        });
    }
}

// 6.2 Preference buttons
// Apply the current weighting choices
function applyPreferences() {
    appliedWeights = getWeights();
    calculateMCDA({ flashHighlights: true });
}

// Reset the UI back to the default state
function clearSelection() {
    sliderIds.forEach((key) => {
        document.getElementById(`w-${key}`).value = sliderDefaults[key];
    });

    resetTargetSelector();
    appliedWeights = { ...sliderDefaults };
    updateSliderLabels();

    if (map) {
        map.closePopup();
    }

    calculateMCDA({ recenter: true, flashHighlights: true });
}

// Fit the whole result set into view
function showAllLocations() {
    if (!currentTargetMeta || currentScoredData.length === 0) {
        return;
    }

    // Frame the target, apartments, and campus outline together
    const bounds = buildBoundsFromResults(currentScoredData, currentTargetMeta);
    if (bounds && bounds.isValid()) {
        map.fitBounds(bounds.pad(0.14), {
            animate: true,
            duration: 0.8
        });
    }
}

// 7. Dialogs and startup
// 7.1 About dialog
// Control the About dialog open and close states
function bindPageNoteDialog() {
    const toggle = document.getElementById("page-note-toggle");
    const modal = document.getElementById("page-note-modal");
    const close = document.getElementById("page-note-close");

    if (!toggle || !modal || !close) {
        return;
    }

    const openDialog = () => {
        modal.hidden = false;
        toggle.setAttribute("aria-expanded", "true");
        close.focus();
    };

    const closeDialog = () => {
        modal.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
    };

    toggle.addEventListener("click", () => {
        if (modal.hidden) {
            openDialog();
            return;
        }

        closeDialog();
    });

    close.addEventListener("click", closeDialog);

    modal.addEventListener("click", (event) => {
        if (event.target === modal) {
            closeDialog();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !modal.hidden) {
            closeDialog();
        }
    });

    // Show the About dialog as soon as the page finishes loading
    openDialog();
}

// 7.2 Event binding and bootstrap
// Attach UI events once on startup
function bindEvents() {
    document.getElementById("target-selector").addEventListener("change", () => {
        calculateMCDA({ recenter: true, flashHighlights: true, flashTarget: true });
    });
    document.getElementById("apply-preferences-btn").addEventListener("click", applyPreferences);
    document.getElementById("reset-preferences-btn").addEventListener("click", clearSelection);
    document.getElementById("show-all-btn").addEventListener("click", showAllLocations);

    sliderIds.forEach((key) => {
        document.getElementById(`w-${key}`).addEventListener("input", () => {
            updateSliderLabels();
        });
    });
}

// Start the page once data and Leaflet are ready
function bootstrap() {
    updateSliderLabels();
    bindPageNoteDialog();

    if (!rawData.length) {
        showDataLoadError();
        return;
    }

    if (typeof L === "undefined") {
        showLeafletLoadError();
        return;
    }

    initMap();
    bindEvents();
    calculateMCDA({ recenter: true });
}

bootstrap();
