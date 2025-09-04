use byteorder::{LittleEndian, ReadBytesExt};
use memmap2::Mmap;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Cursor, Read, Seek, SeekFrom};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KfbHeader {
    pub magic: String,
    pub tile_count: i32,
    pub base_width: i32,
    pub base_height: i32,
    pub zoom_levels: i32,
    pub scan_scale: i32,
    pub compression: String,
    pub spend_time: i32,
    pub scan_time: i64,
    pub image_cap_res: f32,
    pub tile_size: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KfbOffsets {
    pub macro_info_offset: u32,
    pub label_info_offset: u32,
    pub preview_info_offset: u64,
    pub tiles_info_offset: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssociatedImage {
    pub name: String,
    pub width: i32,
    pub height: i32,
    pub length: i32,
    pub data_offset: u64,
    pub offset: u64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KfbTile {
    pub index: i32,
    pub pos_x: i32,
    pub pos_y: i32,
    pub tile_width: i32,
    pub tile_height: i32,
    pub id: i32,
    pub zoom_level: i32,
    pub length: i32,
    pub data_offset: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KfbData {
    pub header: KfbHeader,
    pub offsets: KfbOffsets,
    pub associated_images: Vec<AssociatedImage>,
    pub tiles: Vec<KfbTile>,
}

pub struct KfbParser {
    mmap: Mmap,
}

impl KfbParser {
    pub fn new(file_path: &str) -> anyhow::Result<Self> {
        let file = File::open(file_path)?;
        let mmap = unsafe { Mmap::map(&file)? };
        Ok(KfbParser { mmap })
    }

    pub fn parse(&self) -> anyhow::Result<KfbData> {
        eprintln!("Starting KFB parsing...");
        let mut cursor = Cursor::new(&self.mmap[..]);
        
        // Skip to magic number at offset 4
        cursor.seek(SeekFrom::Start(4))?;
        
        // Read and validate magic number
        let mut magic_bytes = [0u8; 3];
        cursor.read_exact(&mut magic_bytes)?;
        let magic = String::from_utf8_lossy(&magic_bytes).to_string();
        
        if magic != "KFB" {
            return Err(anyhow::anyhow!("Invalid KFB magic number: {}", magic));
        }

        // Skip to offset 16 (where the actual integer data starts)
        cursor.seek(SeekFrom::Start(16))?;
        
        let tile_count = cursor.read_i32::<LittleEndian>()?;
        let base_height = cursor.read_i32::<LittleEndian>()?;
        let base_width = cursor.read_i32::<LittleEndian>()?;
        
        eprintln!("Parsed basic values: tile_count={}, base_height={}, base_width={}", tile_count, base_height, base_width);
        
        // Calculate zoom levels
        let zoom_levels = ((base_height.max(base_width) as f64).log2().ceil() as i32) + 1;
        
        let scan_scale = cursor.read_i32::<LittleEndian>()?;
        
        // Read compression type (4 bytes) - should be at offset 28 now
        let mut compression_bytes = [0u8; 4];
        cursor.read_exact(&mut compression_bytes)?;
        let compression = String::from_utf8_lossy(&compression_bytes).to_string();
        
        // Support common KFB compression formats
        let supported_formats = ["JP2K", "JPEG", "JP2 ", "JPGD", "NONE", "LZMA", "JPG ", "JP  "];
        let is_supported = supported_formats.iter().any(|&fmt| compression.starts_with(fmt)) 
            || compression.starts_with("JP") 
            || compression.starts_with("J2");
        
        if !is_supported {
            // Still allow processing but provide warning about unknown compression
            eprintln!("Warning: Unknown compression format '{}', attempting to continue...", compression);
        }

        // Skip 4 bytes
        cursor.seek(SeekFrom::Current(4))?;
        
        let spend_time = cursor.read_i32::<LittleEndian>()?;
        let scan_time = cursor.read_i64::<LittleEndian>()?;
        
        let macro_info_offset = cursor.read_u32::<LittleEndian>()?;
        let label_info_offset = cursor.read_u32::<LittleEndian>()?;
        let preview_info_offset = cursor.read_u64::<LittleEndian>()?;
        let tiles_info_offset = cursor.read_u64::<LittleEndian>()?;
        
        // Read image capture resolution (should be around offset 0x4C based on hex dump)
        let image_cap_res = cursor.read_f32::<LittleEndian>()?;
        
        // Skip 8 bytes
        cursor.seek(SeekFrom::Current(8))?;
        
        let tile_size = cursor.read_i32::<LittleEndian>()?;

        let header = KfbHeader {
            magic,
            tile_count,
            base_width,
            base_height,
            zoom_levels,
            scan_scale,
            compression,
            spend_time,
            scan_time,
            image_cap_res,
            tile_size,
        };

        let offsets = KfbOffsets {
            macro_info_offset,
            label_info_offset,
            preview_info_offset,
            tiles_info_offset,
        };

        // Parse associated images
        let mut associated_images = Vec::new();
        associated_images.push(self.parse_associated_image("macro", macro_info_offset as u64)?);
        associated_images.push(self.parse_associated_image("label", label_info_offset as u64)?);
        associated_images.push(self.parse_associated_image("preview", preview_info_offset)?);

        // Parse tiles
        eprintln!("About to parse {} tiles...", tile_count);
        let tiles = self.parse_tiles(tiles_info_offset, tile_count, zoom_levels)?;
        eprintln!("Finished parsing tiles, got {} tiles", tiles.len());

        Ok(KfbData {
            header,
            offsets,
            associated_images,
            tiles,
        })
    }

    fn parse_associated_image(&self, name: &str, offset: u64) -> anyhow::Result<AssociatedImage> {
        if offset == 0 || offset as usize >= self.mmap.len() {
            return Ok(AssociatedImage {
                name: name.to_string(),
                width: 0,
                height: 0,
                length: 0,
                data_offset: 0,
                offset,
                error: Some("Invalid offset".to_string()),
            });
        }

        let mut cursor = Cursor::new(&self.mmap[..]);
        cursor.seek(SeekFrom::Start(offset))?;
        
        // Skip 8 bytes
        cursor.seek(SeekFrom::Current(8))?;
        
        let height = cursor.read_i32::<LittleEndian>()?;
        let width = cursor.read_i32::<LittleEndian>()?;
        
        // Skip 4 bytes
        cursor.seek(SeekFrom::Current(4))?;
        
        let length = cursor.read_i32::<LittleEndian>()?;
        let data_offset = offset + 52; // Fixed offset for image data

        Ok(AssociatedImage {
            name: name.to_string(),
            width,
            height,
            length,
            data_offset,
            offset,
            error: None,
        })
    }

    fn parse_tiles(&self, offset: u64, tile_count: i32, zoom_levels: i32) -> anyhow::Result<Vec<KfbTile>> {
        if offset == 0 || offset as usize >= self.mmap.len() {
            return Ok(Vec::new());
        }

        let mut tiles = Vec::new();
        let mut cursor = Cursor::new(&self.mmap[..]);
        cursor.seek(SeekFrom::Start(offset))?;
        
        let mut base_level = -1;
        
        for i in 0..tile_count {
            // Skip 4 bytes
            cursor.seek(SeekFrom::Current(4))?;
            
            let pos_x = cursor.read_i32::<LittleEndian>()?;
            let pos_y = cursor.read_i32::<LittleEndian>()?;
            let tile_width = cursor.read_i32::<LittleEndian>()?;
            let tile_height = cursor.read_i32::<LittleEndian>()?;
            
            let id = cursor.read_i32::<LittleEndian>()?;
            if i == 0 {
                base_level = id;
            }
            
            let zoom_level = (base_level - id) / 8388608;
            
            if zoom_level < 0 || zoom_level >= zoom_levels {
                // Skip this tile if zoom level is invalid
                cursor.seek(SeekFrom::Current(32))?;
                continue;
            }
            
            // Skip 8 bytes
            cursor.seek(SeekFrom::Current(8))?;
            
            let length = cursor.read_i32::<LittleEndian>()?;
            let offset_from_file = cursor.read_i64::<LittleEndian>()?;
            // Match OpenSlide implementation: offset = seek_location + offset_from_file
            // Negative offsets are normal and valid in KFB format
            let tile_data_offset = (offset as i64 + offset_from_file) as u64;
            
            // Skip remaining 20 bytes
            cursor.seek(SeekFrom::Current(20))?;
            
            tiles.push(KfbTile {
                index: i,
                pos_x,
                pos_y,
                tile_width,
                tile_height,
                id,
                zoom_level,
                length,
                data_offset: tile_data_offset,
            });
        }
        
        Ok(tiles)
    }

    pub fn get_hex_dump(&self, offset: usize, length: usize) -> String {
        let start = offset.min(self.mmap.len());
        let end = (start + length).min(self.mmap.len());
        let data = &self.mmap[start..end];
        
        let mut result = String::new();
        
        for (i, chunk) in data.chunks(16).enumerate() {
            let line_offset = start + i * 16;
            result.push_str(&format!("{:08x}  ", line_offset));
            
            // Hex bytes
            for (j, &byte) in chunk.iter().enumerate() {
                if j == 8 {
                    result.push(' ');
                }
                result.push_str(&format!("{:02x} ", byte));
            }
            
            // Pad if line is short
            for j in chunk.len()..16 {
                if j == 8 {
                    result.push(' ');
                }
                result.push_str("   ");
            }
            
            result.push_str(" |");
            
            // ASCII representation
            for &byte in chunk {
                if byte >= 32 && byte <= 126 {
                    result.push(byte as char);
                } else {
                    result.push('.');
                }
            }
            
            result.push_str("|\n");
        }
        
        result
    }

    pub fn read_chunk(&self, offset: usize, length: usize) -> Vec<u8> {
        let start = offset.min(self.mmap.len());
        let end = (start + length).min(self.mmap.len());
        self.mmap[start..end].to_vec()
    }

    pub fn file_size(&self) -> usize {
        self.mmap.len()
    }

    pub fn decode_tile_image(&self, tile_index: i32) -> anyhow::Result<String> {
        // Find the tile by index
        let data = self.parse()?;
        let tile = data.tiles.iter()
            .find(|t| t.index == tile_index)
            .ok_or_else(|| anyhow::anyhow!("Tile with index {} not found", tile_index))?;

        // Read the tile data from the file
        let tile_data = self.read_chunk(tile.data_offset as usize, tile.length as usize);
        
        // Convert raw tile data to base64 for frontend display
        // The frontend can decode this as JPEG/JP2K depending on the compression format
        let base64_data = base64_encode(&tile_data);
        
        Ok(base64_data)
    }

    pub fn decode_associated_image(&self, image_name: &str) -> anyhow::Result<String> {
        // Find the associated image by name
        let data = self.parse()?;
        let image = data.associated_images.iter()
            .find(|img| img.name == image_name)
            .ok_or_else(|| anyhow::anyhow!("Associated image '{}' not found", image_name))?;

        // Check for errors
        if image.error.is_some() {
            return Err(anyhow::anyhow!("Associated image '{}' has error: {}", 
                image_name, image.error.as_ref().unwrap()));
        }

        // Read the image data from the file
        let image_data = self.read_chunk(image.data_offset as usize, image.length as usize);
        
        // Convert raw image data to base64 for frontend display
        // Associated images are typically JPEG format
        let base64_data = base64_encode(&image_data);
        
        Ok(base64_data)
    }
}

// Helper function to encode data as base64
fn base64_encode(data: &[u8]) -> String {
    
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    
    for chunk in data.chunks(3) {
        let mut buf = [0u8; 3];
        for (i, &b) in chunk.iter().enumerate() {
            buf[i] = b;
        }
        
        let b0 = buf[0] as usize;
        let b1 = buf[1] as usize;
        let b2 = buf[2] as usize;
        
        result.push(CHARS[b0 >> 2] as char);
        result.push(CHARS[((b0 & 0x03) << 4) | (b1 >> 4)] as char);
        
        if chunk.len() > 1 {
            result.push(CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] as char);
        } else {
            result.push('=');
        }
        
        if chunk.len() > 2 {
            result.push(CHARS[b2 & 0x3f] as char);
        } else {
            result.push('=');
        }
    }
    
    result
}