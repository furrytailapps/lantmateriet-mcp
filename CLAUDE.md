# mcp-lantmateriet

> For shared patterns and coding standards, see parent CLAUDE.md.

MCP server wrapping Lantmäteriet (Swedish Land Survey) HVD APIs for property, elevation, and map data.

## Production URL

https://mcp-lantmateriet.vercel.app/mcp

## Tools

- `lm_property_search` — Find properties by coordinate, address, or designation
- `lm_elevation` — Get terrain height at coordinates
- `lm_map_url` — Generate WMS/WMTS URLs for map display
- `lm_stac_search` — Search STAC catalog for downloadable ortofoto/elevation data

## Environment Variables

- `LANTMATERIET_CONSUMER_KEY` + `LANTMATERIET_CONSUMER_SECRET` — Register at Geotorget (https://geotorget.lantmateriet.se/)

## Quirks

- OAuth2 Client Credentials flow; tokens auto-refresh (1hr lifetime)
- HVD datasets became free February 2025
- Input WGS84, internal SWEREF99TM (auto-converts)
