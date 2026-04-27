# Find a suitable student apartment in Leeds!

## About The Project
This project developed an interactive web map to help University of Leeds students find suitable accommodation more efficiently. Traditional apartment searches are fragmented across multiple websites, making it difficult to compare variables in a unified spatial context. This platform visualises all apartment information on an interactive map, enabling Leeds students to identify the most suitable apartments based on their own priorities.

## Target Audience
* The primary users of this site are new and international students who need a quick and reliable way to access apartment listings, locations, and basic information.
* The potential use case is for apartment developers to identify an ideal project location.

## Key Features
* **Weighted apartment scoring system**: Each apartment is given a composite score based on distance to the selected target, rent, user rating, and renovation year.
* **Dynamic distance calculation**: It recalculates the distance between each apartment and the selected destination whenever the target changes.
* **SVG radar chart**: Radar charts provide a clearer breakdown of how each apartment performs under the selected weighting scheme.
* **Interactive Filtering**: Users can filter and weight options according to target location, rent, rating, and renovation year to find apartments that best meet their needs.

## Technologies Used
* **HTML / CSS / JavaScript**: Used to structure the webpage, define layout, and manage dynamic behaviour.
* **Leaflet**: Selected as the main mapping library because it is lightweight and integrates effectively with standard frontend technologies.
* **CARTO Voyager basemap**: Used to provide a visually balanced urban background suitable for Leeds.
* **Google Fonts**: Cormorant Garamond and Manrope are used for page typography.

## Data Sources
* **Accommodation data**: Uhomes platform.
* **Campus boundary**: OpenStreetMap.
* **Icons**: The Noun Project.

## Future Development
* Replace the local dataset with online data updating so that the platform no longer depends entirely on manual data maintenance.
* Support users in submitting apartment information.
* Add more geographical layers, such as transport, retail, healthcare, nightlife, and crime data.
* Replace straight-line distance with walking route distance.
* Calculate the number of educational, healthcare, shopping, and transport facilities within a 10-minute walking range of each apartment.
* Display full user reviews directly on the site.
* Improve the page design and presentation through richer graphics, clearer text hierarchy, and a more visually attractive interface.
