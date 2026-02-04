# Lantmäteriet API Research

> Research notes for mcp-lantmateriet implementation. This file documents API endpoints, authentication, and design decisions.

## Overview

Lantmäteriet (Swedish Land Survey) provides geodata APIs through their API Portal. As of February 2025, 9 High Value Datasets became free under PSI directive.

## High Value Datasets (Free)

| Dataset                 | Description         | Format            |
| ----------------------- | ------------------- | ----------------- |
| Fastighetsindelning     | Property boundaries | Vector (OGC API)  |
| Byggnad                 | Buildings           | Vector (OGC API)  |
| Höjddata                | Elevation/DEM       | Raster (WCS)      |
| Ortofoto                | Aerial imagery      | Raster (WMTS/WMS) |
| Ortnamn                 | Place names         | Vector (OGC API)  |
| Adress                  | Addresses           | Vector (OGC API)  |
| Marktäcke               | Land cover          | Vector/Raster     |
| Hydrografi              | Water features      | Vector (OGC API)  |
| Administrativ indelning | Admin boundaries    | Vector (OGC API)  |

## API Access

### Registration

1. Create account at https://geotorget.lantmateriet.se
2. Register application in API Portal
3. Subscribe to desired APIs
4. Get OAuth2 credentials (consumer key/secret)

### Authentication

- OAuth2 Client Credentials flow
- Token endpoint: `https://api.lantmateriet.se/token`
- Token lifetime: 3600 seconds (1 hour)
- Bearer token in Authorization header

### Example Token Request

```bash
curl -X POST https://api.lantmateriet.se/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CONSUMER_KEY" \
  -d "client_secret=YOUR_CONSUMER_SECRET"
```

## API Endpoints (Conceptual)

### Property (Fastighetsindelning)

```
# Find property by coordinate
GET /fastighetsindelning/v1/hitta?geometri=POINT(674000 6580000)

# Get property details
GET /fastighetsindelning/v1/{objektidentitet}
```

### Elevation (Höjddata)

```
# Point elevation query
GET /hojd/v1/punkt?nord=6580000&ost=674000&referenssystem=3006

# Coverage (WCS)
https://api.lantmateriet.se/hojd/wcs/v1
```

### Maps (WMTS/WMS)

```
# Topographic (CC-BY licensed)
https://api.lantmateriet.se/open/topowebb-ccby/v1/wmts

# Orthophoto
https://api.lantmateriet.se/open/ortofoto/v1/wmts
```

### Address (Adress)

```
GET /adress/v1/sok?adress=Drottninggatan 1, Stockholm
```

## Coordinate Systems

### SWEREF99 TM (EPSG:3006)

- Native Swedish coordinate system
- X = Easting (200,000 - 1,000,000)
- Y = Northing (6,100,000 - 7,700,000)
- Unit: meters

### WGS84 (EPSG:4326)

- GPS/map coordinates
- Sweden bounds: 55-69°N, 11-24°E

### Conversion

Use `sweden-crs-transformations-4typescript` library for accurate conversion.

## Rate Limits

- Varies by subscription tier
- Generally 100-1000 requests/minute
- Implement token caching and request throttling

## Design Decisions

### 1. Four Tools Maximum

Following monorepo 4-tool constraint:

- `lm_property_search` - Property queries
- `lm_elevation` - Height data
- `lm_map_url` - Map tile URLs
- `lm_describe` - Dataset documentation

### 2. Flat Schemas

LLMs struggle with nested objects. Use flat parameters:

```typescript
// Good
{ x: z.number(), y: z.number() }

// Bad
{ coordinate: z.object({ x, y }) }
```

### 3. Coordinate Flexibility

Accept both SWEREF99 and WGS84, auto-detect and convert:

- If x > 100000, assume SWEREF99
- If latitude/longitude provided, convert from WGS84

### 4. Token Caching

Cache OAuth2 tokens for efficiency:

- Store token with expiry timestamp
- Refresh 5 minutes before expiry
- Thread-safe refresh mechanism

## Use Cases

### Property Information

"What property is at this GPS coordinate?"
→ Convert WGS84 to SWEREF99, query property API

### Site Elevation

"What's the elevation at this construction site?"
→ Point elevation query

### Map Generation

"Show me a map of this area"
→ Generate WMTS URL for client rendering

### Dataset Discovery

"What geodata is available from Lantmäteriet?"
→ Describe HVD datasets and access patterns

## References

- Lantmäteriet API Portal: https://geotorget.lantmateriet.se
- HVD Announcement: https://www.lantmateriet.se/hvd
- SWEREF99 Documentation: https://www.lantmateriet.se/sweref99
- PSI Directive: https://eur-lex.europa.eu/eli/dir/2019/1024
