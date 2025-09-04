use crate::kfb::{KfbData, KfbParser};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

// Global state to store parsers for opened files
type ParserStore = Mutex<HashMap<String, KfbParser>>;

#[tauri::command]
pub async fn open_kfb_file(file_path: String) -> Result<bool, String> {
    // Validate file exists and has .kfb extension
    if !std::path::Path::new(&file_path).exists() {
        return Err("File does not exist".to_string());
    }
    
    if !file_path.to_lowercase().ends_with(".kfb") {
        return Err("File must have .kfb extension".to_string());
    }
    
    Ok(true)
}

#[tauri::command]
pub async fn parse_kfb_file(
    file_path: String,
    parsers: State<'_, ParserStore>,
) -> Result<KfbData, String> {
    eprintln!("parse_kfb_file command called with: {}", file_path);
    let parser = KfbParser::new(&file_path).map_err(|e| {
        eprintln!("Failed to create KfbParser: {}", e);
        e.to_string()
    })?;
    eprintln!("KfbParser created successfully");
    let data = parser.parse().map_err(|e| {
        eprintln!("Failed to parse KFB: {}", e);
        e.to_string()
    })?;
    
    // Store parser for later use
    parsers
        .lock()
        .unwrap()
        .insert(file_path.clone(), parser);
    
    Ok(data)
}

#[tauri::command]
pub async fn read_file_chunk(
    file_path: String,
    offset: usize,
    length: usize,
    parsers: State<'_, ParserStore>,
) -> Result<Vec<u8>, String> {
    let parsers_lock = parsers.lock().unwrap();
    let parser = parsers_lock
        .get(&file_path)
        .ok_or("File not opened")?;
    
    Ok(parser.read_chunk(offset, length))
}

#[tauri::command]
pub async fn get_hex_dump(
    file_path: String,
    offset: usize,
    length: usize,
    parsers: State<'_, ParserStore>,
) -> Result<String, String> {
    let parsers_lock = parsers.lock().unwrap();
    let parser = parsers_lock
        .get(&file_path)
        .ok_or("File not opened")?;
    
    Ok(parser.get_hex_dump(offset, length))
}

#[tauri::command]
pub async fn decode_tile_image(
    file_path: String,
    tile_index: i32,
    parsers: State<'_, ParserStore>,
) -> Result<String, String> {
    let parsers_lock = parsers.lock().unwrap();
    let parser = parsers_lock
        .get(&file_path)
        .ok_or("File not opened")?;
    
    parser.decode_tile_image(tile_index).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn decode_associated_image(
    file_path: String,
    image_name: String,
    parsers: State<'_, ParserStore>,
) -> Result<String, String> {
    let parsers_lock = parsers.lock().unwrap();
    let parser = parsers_lock
        .get(&file_path)
        .ok_or("File not opened")?;
    
    parser.decode_associated_image(&image_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn debug_file_header(
    file_path: String,
    parsers: State<'_, ParserStore>,
) -> Result<String, String> {
    let parsers_lock = parsers.lock().unwrap();
    let parser = parsers_lock
        .get(&file_path)
        .ok_or("File not opened")?;
    
    // Get hex dump of first 128 bytes to analyze the header structure
    Ok(parser.get_hex_dump(0, 128))
}


#[tauri::command]
pub async fn get_tile(
    file_path: String,
    level: u32,
    x: u32,
    y: u32,
    parsers: State<'_, ParserStore>,
) -> Result<String, String> {
    eprintln!("Tile request: level={}, x={}, y={}, file={}", level, x, y, file_path);
    
    let parsers_lock = parsers.lock().unwrap();
    let parser = parsers_lock
        .get(&file_path)
        .ok_or("File not opened")?;
    
    // Get the parsed data to find the appropriate tile
    let data = parser.parse().map_err(|e| e.to_string())?;
    
    // Debug: Print available zoom levels
    let available_levels: Vec<i32> = data.tiles.iter().map(|t| t.zoom_level).collect();
    let mut unique_levels = available_levels.clone();
    unique_levels.sort();
    unique_levels.dedup();
    eprintln!("Available zoom levels in KFB: {:?}", unique_levels);
    
    // For now, let's try a simpler approach: just find any tile at the requested level
    let tiles_at_level: Vec<&crate::kfb::KfbTile> = data.tiles.iter()
        .filter(|t| t.zoom_level as u32 == level)
        .collect();
    
    eprintln!("Tiles at level {}: {}", level, tiles_at_level.len());
    
    if tiles_at_level.is_empty() {
        // If no tiles at exact level, try the closest level
        let closest_level = unique_levels.iter()
            .min_by_key(|&&l| (l as i32 - level as i32).abs())
            .unwrap_or(&0);
        
        eprintln!("No tiles at level {}, trying closest level {}", level, closest_level);
        
        let closest_tiles: Vec<&crate::kfb::KfbTile> = data.tiles.iter()
            .filter(|t| t.zoom_level == *closest_level)
            .collect();
        
        if let Some(tile) = closest_tiles.first() {
            eprintln!("Using tile {} from level {}", tile.index, closest_level);
            return parser.decode_tile_image(tile.index).map_err(|e| e.to_string());
        }
    } else {
        // Try to find the best matching tile at this level
        // For now, just return the first tile at this level
        if let Some(tile) = tiles_at_level.first() {
            eprintln!("Using tile {} at level {} (pos: {}, {})", tile.index, level, tile.pos_x, tile.pos_y);
            return parser.decode_tile_image(tile.index).map_err(|e| e.to_string());
        }
    }
    
    Err(format!("No tiles available. File has {} total tiles across levels: {:?}", 
                data.tiles.len(), unique_levels))
}

