# KFB File Format Specification

## Overview

The KFB (KFBIO) format is a proprietary file format used for storing digital microscopy images, particularly in whole slide imaging applications. This document describes the binary structure of KFB files based on reverse engineering and analysis of the OpenSlide implementation.

## File Structure

```
KFB File Layout:
┌─────────────────────┐
│     File Header     │  ~88 bytes
├─────────────────────┤
│   Associated Images │  Variable size
│   - Macro Image     │
│   - Label Image     │ 
│   - Preview Image   │
├─────────────────────┤
│   Tile Information  │  Variable size
├─────────────────────┤
│     Tile Data       │  Variable size
│   (JPEG compressed) │
└─────────────────────┘
```

## File Header (88 bytes)

The KFB file header contains metadata about the image structure and pointers to various data sections.

### Header Structure

| Offset | Size | Type     | Name               | Description                           |
|--------|------|----------|--------------------|---------------------------------------|
| 0x00   | 4    | bytes    | Unknown            | Reserved/unknown bytes                |
| 0x04   | 3    | char[3]  | Magic              | "KFB" magic identifier               |
| 0x07   | 1    | byte     | Version            | Format version                        |
| 0x08   | 4    | bytes    | Unknown            | Reserved/unknown bytes                |
| 0x0C   | 4    | int32_le | TileCount          | Total number of tiles in pyramid     |
| 0x10   | 4    | int32_le | BaseHeight         | Height of base (highest resolution) level |
| 0x14   | 4    | int32_le | BaseWidth          | Width of base (highest resolution) level |
| 0x18   | 4    | int32_le | ScanScale          | Scanning magnification (e.g., 20, 40) |
| 0x1C   | 4    | char[4]  | Compression        | "JPEG" or "JP  " compression type    |
| 0x20   | 4    | bytes    | Unknown            | Reserved/unknown bytes                |
| 0x24   | 4    | int32_le | SpendTime          | Scan duration time                    |
| 0x28   | 8    | int64_le | ScanTime           | Scan timestamp                        |
| 0x30   | 4    | uint32_le| MacroInfoOffset    | Offset to macro image information     |
| 0x34   | 4    | uint32_le| LabelInfoOffset    | Offset to label image information     |
| 0x38   | 8    | uint64_le| PreviewInfoOffset  | Offset to preview image information   |
| 0x40   | 8    | uint64_le| TilesInfoOffset    | Offset to tile information section    |
| 0x48   | 4    | float32_le| ImageCapRes       | Image capture resolution (μm/pixel)  |
| 0x4C   | 8    | bytes    | Unknown            | Reserved/unknown bytes                |
| 0x54   | 4    | int32_le | TileSize           | Standard tile dimensions (e.g., 256)  |

## Associated Images

KFB files contain three associated images: macro, label, and preview. Each follows the same structure.

### Associated Image Header (52 bytes)

| Offset | Size | Type     | Name        | Description                    |
|--------|------|----------|-------------|--------------------------------|
| 0x00   | 8    | bytes    | Unknown     | Reserved/unknown bytes         |
| 0x08   | 4    | int32_le | Height      | Image height in pixels         |
| 0x0C   | 4    | int32_le | Width       | Image width in pixels          |
| 0x10   | 4    | bytes    | Unknown     | Reserved/unknown bytes         |
| 0x14   | 4    | int32_le | Length      | JPEG data length in bytes      |
| 0x18   | 28   | bytes    | Unknown     | Reserved/unknown bytes         |

### Associated Image Types

1. **Macro Image**: Low-resolution overview of the entire slide
2. **Label Image**: Image of the slide label with text/barcode
3. **Preview Image**: Medium-resolution thumbnail for navigation

The JPEG image data immediately follows the 52-byte header for each associated image.

## Tile Information Section

The tile information section contains metadata for each tile in the image pyramid.

### Tile Entry Structure (64 bytes)

| Offset | Size | Type     | Name            | Description                        |
|--------|------|----------|-----------------|-----------------------------------|
| 0x00   | 4    | bytes    | Unknown         | Reserved/unknown bytes            |
| 0x04   | 4    | int32_le | PosX            | X position in level coordinates   |
| 0x08   | 4    | int32_le | PosY            | Y position in level coordinates   |
| 0x0C   | 4    | int32_le | TileWidth       | Tile width in pixels             |
| 0x10   | 4    | int32_le | TileHeight      | Tile height in pixels            |
| 0x14   | 4    | int32_le | ID              | Tile identifier for level calculation |
| 0x18   | 8    | bytes    | Unknown         | Reserved/unknown bytes            |
| 0x20   | 4    | int32_le | Length          | JPEG data length in bytes         |
| 0x24   | 8    | int64_le | OffsetFromBase  | Offset from tile info base        |
| 0x2C   | 20   | bytes    | Unknown         | Reserved/unknown bytes            |

## Zoom Level Calculation

The zoom level for each tile is calculated using the tile ID:

```
BaseLevel = ID of first tile
ZoomLevel = (BaseLevel - TileID) / 8388608
```

This creates a pyramid structure where:
- Level 0: Full resolution (1:1)
- Level 1: Half resolution (1:2)
- Level 2: Quarter resolution (1:4)
- etc.

## Coordinate System

- **File coordinates**: Absolute pixel positions in the full-resolution image
- **Level coordinates**: Scaled coordinates for the specific zoom level
- **Tile coordinates**: Position within the tile grid for a level

## Data Types

All multi-byte values are stored in **little-endian** format:
- `int32_le`: 32-bit signed integer, little-endian
- `uint32_le`: 32-bit unsigned integer, little-endian
- `int64_le`: 64-bit signed integer, little-endian
- `uint64_le`: 64-bit unsigned integer, little-endian
- `float32_le`: 32-bit IEEE 754 float, little-endian

## Image Compression

All image data (tiles and associated images) use **JPEG compression**. The compressed data follows immediately after the respective headers.

### JPEG Tile Properties
- Standard JPEG format
- Baseline DCT encoding
- Variable quality depending on zoom level
- RGB color space (typically)

## Properties and Metadata

The format supports various metadata properties:

### Standard Properties
- `kfbio.SpendTime`: Scanning time duration
- `kfbio.ScanTime`: Timestamp of the scan
- `kfbio.ScanScale`: Objective magnification (20×, 40×, etc.)
- `kfbio.ImageCapRes`: Microns per pixel resolution
- `kfbio.TileSize`: Standard tile dimensions

### OpenSlide Compatible Properties
- `openslide.objective-power`: Mapped from ScanScale
- `openslide.mpp-x`: Mapped from ImageCapRes
- `openslide.mpp-y`: Mapped from ImageCapRes

## File Size Considerations

KFB files can be very large (GB to TB scale):
- **Base level**: Full resolution, largest data size
- **Pyramid levels**: Progressively smaller, 1/4 data per level
- **Tile overlap**: Tiles may have overlapping regions
- **Compression**: JPEG compression significantly reduces file size

## Implementation Notes

### Memory Management
- Use memory mapping for efficient large file access
- Stream processing for tile data to avoid loading entire file
- Cache frequently accessed tiles

### Error Handling
- Validate magic number and basic header structure
- Check file size against expected data regions
- Verify JPEG data integrity for critical tiles

### Performance Optimization
- Index tile positions for fast lookup
- Implement tile caching with LRU eviction
- Use background loading for smooth navigation

## Example File Structure

```
Offset    Size    Content
0x000000  88      File Header
0x000058  1024    Macro Image (52 byte header + JPEG data)
0x000458  2048    Label Image (52 byte header + JPEG data)
0x000C58  4096    Preview Image (52 byte header + JPEG data)
0x001C58  12800   Tile Information (200 tiles × 64 bytes)
0x004E58  ...     Tile Data (JPEG compressed)
```

## Validation

### File Format Validation
1. Check magic number "KFB" at offset 0x04
2. Verify file size matches expected structure
3. Validate offset pointers are within file bounds
4. Confirm JPEG headers for image data

### Data Integrity
1. Verify tile count matches actual tile entries
2. Check zoom level calculations are consistent
3. Validate image dimensions are reasonable
4. Test JPEG decompression for sample tiles

## References

- OpenSlide KFB implementation: `openslide-vendor-kfbio.c`
- JPEG specification: ITU-T T.81
- Digital microscopy standards: IEEE/ISO standards

---

*This specification is based on reverse engineering of KFB files and may not cover all variants or edge cases. For production implementations, thorough testing with diverse KFB files is recommended.*