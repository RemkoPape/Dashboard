# Data Sources

| Source name | Category | URL or documentation | Data type | Update frequency | Browser fetch or cache mode | API key requirement | Attribution requirement | Licence notes | Known limitations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| USGS Significant Earthquakes | earthquake | https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php | GeoJSON | 15 min | Live browser fetch | No | USGS | Public domain | Depends on USGS availability and browser network access |
| USGS Earthquakes Past Day | earthquake | https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php | GeoJSON | 15 min | Live browser fetch | No | USGS | Public domain | Some endpoints may throttle if refreshed too often |
| NASA EONET Wildfires | wildfire | https://eonet.gsfc.nasa.gov/docs/v3 | GeoJSON | 30 min | Live browser fetch with compact fallback | No | NASA EONET | NASA data policy | Event reporting is lighter than satellite thermal detections |
| NASA EONET Floods | flood | https://eonet.gsfc.nasa.gov/docs/v3 | GeoJSON | 30 min | Live browser fetch with compact fallback | No | NASA EONET | NASA data policy | Coverage depends on EONET event tagging |
| NASA EONET Storms | storm | https://eonet.gsfc.nasa.gov/docs/v3 | GeoJSON | 30 min | Live browser fetch with compact fallback | No | NASA EONET | NASA data policy | Category mapping can be coarse |
| NASA EONET Volcanoes | volcano | https://eonet.gsfc.nasa.gov/docs/v3 | GeoJSON | 60 min | Live browser fetch with compact fallback | No | NASA EONET | NASA data policy | Not every eruption is represented equally |
| NASA EONET Landslides | landslide | https://eonet.gsfc.nasa.gov/docs/v3 | GeoJSON | 60 min | Live browser fetch with compact fallback | No | NASA EONET | NASA data policy | Event tagging can lag the source event |
| US National Weather Service Active Alerts | weather | https://www.weather.gov/documentation/services-web-api | GeoJSON | 10 min | Live browser fetch with compact fallback | No | NOAA / NWS | U.S. government data | Regional alert coverage and payload structure can change |
| GDELT Conflict and War Signals | conflict | https://www.gdeltproject.org/ | JSON article feed | 60 min | Live browser fetch with compact fallback | No | GDELT Project | Source-specific | News reporting is incomplete and may be disputed |
| NASA EPIC Earth Imagery | satellite | https://epic.gsfc.nasa.gov/ | JSON | 180 min | Live browser fetch with compact fallback | No | NASA EPIC | NASA data policy | Imagery is representative rather than event-driven |
| AirNow Air Quality | climate | https://docs.airnowapi.org/ | API | 60 min | External/manual only for now | Usually yes | AirNow | Agency terms apply | Browser access and terms need a source-specific adapter |