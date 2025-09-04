use crate::kfb::{KfbData, KfbParser};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

// Global state to store parsers for opened files
type ParserStore = Mutex<HashMap<String, KfbParser>>;
type DataStore = Mutex<HashMap<String, KfbData>>;

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
    data_cache: State<'_, DataStore>,
) -> Result<KfbData, String> {
    if cfg!(debug_assertions) { eprintln!("parse_kfb_file: {}", file_path); }
    let parser = KfbParser::new(&file_path).map_err(|e| {
        if cfg!(debug_assertions) { eprintln!("Failed to create KfbParser: {}", e); }
        e.to_string()
    })?;
    if cfg!(debug_assertions) { eprintln!("KfbParser created successfully"); }
    let data = parser.parse().map_err(|e| {
        if cfg!(debug_assertions) { eprintln!("Failed to parse KFB: {}", e); }
        e.to_string()
    })?;
    
    // Store parser for later use
    parsers
        .lock()
        .unwrap()
        .insert(file_path.clone(), parser);
    data_cache
        .lock()
        .unwrap()
        .insert(file_path.clone(), data.clone());
    
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
    data_cache: State<'_, DataStore>,
) -> Result<String, String> {
    if cfg!(debug_assertions) { eprintln!("Tile request: level={}, x={}, y={}, file={}", level, x, y, file_path); }

    let parsers_lock = parsers.lock().unwrap();
    let parser = parsers_lock
        .get(&file_path)
        .ok_or("File not opened")?;

    // Use cached metadata if available to avoid re-parsing/logging
    let data = if let Some(cached) = data_cache.lock().unwrap().get(&file_path) {
        cached.clone()
    } else {
        let parsed = parser.parse().map_err(|e| e.to_string())?;
        data_cache.lock().unwrap().insert(file_path.clone(), parsed.clone());
        parsed
    };

    // Find exact tile by KFB zoom level and top-left position
    let lvl_i32 = level as i32;
    let x_i32 = x as i32;
    let y_i32 = y as i32;

    // Filter down to level
    let mut tiles_at_level = data.tiles.iter().filter(|t| t.zoom_level == lvl_i32);

    // Try exact match on pos_x/pos_y
    if let Some(tile) = tiles_at_level.clone().find(|t| t.pos_x == x_i32 && t.pos_y == y_i32) {
        if cfg!(debug_assertions) {
            eprintln!(
                "get_tile exact match: index={}, level={}, pos=({}, {}) len={}",
                tile.index, tile.zoom_level, tile.pos_x, tile.pos_y, tile.length
            );
        }
        return parser.decode_tile_image(tile.index).map_err(|e| e.to_string());
    }

    // Fallback: find tile covering the requested coordinate (if caller passed a pixel inside tile)
    if let Some(tile) = tiles_at_level.clone().find(|t| {
        x_i32 >= t.pos_x
            && x_i32 < t.pos_x + t.tile_width
            && y_i32 >= t.pos_y
            && y_i32 < t.pos_y + t.tile_height
    }) {
        if cfg!(debug_assertions) {
            eprintln!(
                "get_tile coverage match: index={}, level={}, pos=({}, {}) len={}",
                tile.index, tile.zoom_level, tile.pos_x, tile.pos_y, tile.length
            );
        }
        return parser.decode_tile_image(tile.index).map_err(|e| e.to_string());
    }

    // Diagnostics
    let mut level_set: Vec<i32> = data.tiles.iter().map(|t| t.zoom_level).collect();
    level_set.sort();
    level_set.dedup();
    if cfg!(debug_assertions) {
        eprintln!(
            "get_tile: no match for level {} at pos ({}, {}). Levels present: {:?}",
            level, x, y, level_set
        );
    }

    Err(format!(
        "No tile found at level {} and pos ({}, {}).", level, x, y
    ))
}
