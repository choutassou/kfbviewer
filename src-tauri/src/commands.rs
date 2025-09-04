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

#[derive(serde::Serialize)]
pub struct OpenSeaDragonConfig {
    pub width: u32,
    pub height: u32,
    pub tile_size: u32,
    pub min_level: u32,
    pub max_level: u32,
}

#[tauri::command]
pub async fn get_openseadragon_config(
    file_path: String,
    parsers: State<'_, ParserStore>,
) -> Result<OpenSeaDragonConfig, String> {
    let parsers_lock = parsers.lock().unwrap();
    let parser = parsers_lock
        .get(&file_path)
        .ok_or("File not opened")?;
    
    let data = parser.parse().map_err(|e| e.to_string())?;
    
    // Calculate zoom levels
    let mut levels: Vec<u32> = data.tiles.iter().map(|t| t.zoom_level as u32).collect();
    levels.sort();
    levels.dedup();
    
    let min_level = *levels.first().unwrap_or(&0);
    let max_level = *levels.last().unwrap_or(&0);
    
    // Use a common tile size (most KFB tiles are 256x256)
    let tile_size = data.tiles.first()
        .map(|t| t.tile_width.max(t.tile_height) as u32)
        .unwrap_or(256);
    
    Ok(OpenSeaDragonConfig {
        width: data.header.base_width as u32,
        height: data.header.base_height as u32,
        tile_size,
        min_level,
        max_level,
    })
}

#[tauri::command]
pub async fn get_tile_for_openseadragon(
    file_path: String,
    level: u32,
    x: u32,
    y: u32,
    parsers: State<'_, ParserStore>,
) -> Result<String, String> {
    let parsers_lock = parsers.lock().unwrap();
    let parser = parsers_lock
        .get(&file_path)
        .ok_or("File not opened")?;
    
    // Get the parsed data to find the appropriate tile
    let data = parser.parse().map_err(|e| e.to_string())?;
    
    // Get the tile size for coordinate conversion (assuming square tiles)
    let tile_size = data.tiles.first()
        .map(|t| t.tile_width)
        .unwrap_or(256) as u32;
    
    // Convert OpenSeaDragon tile coordinates (x, y) to KFB pixel coordinates
    // OpenSeaDragon uses tile indices, KFB uses pixel positions
    let pixel_x = (x * tile_size) as i32;
    let pixel_y = (y * tile_size) as i32;
    
    // Find tile by zoom level and pixel coordinates
    let matching_tile = data.tiles.iter().find(|tile| {
        tile.zoom_level as u32 == level &&
        tile.pos_x == pixel_x &&
        tile.pos_y == pixel_y
    });
    
    if let Some(tile) = matching_tile {
        parser.decode_tile_image(tile.index).map_err(|e| e.to_string())
    } else {
        // Log available tiles for debugging
        let tiles_at_level: Vec<_> = data.tiles.iter()
            .filter(|t| t.zoom_level as u32 == level)
            .map(|t| format!("({}, {}) -> tile_{}", t.pos_x, t.pos_y, t.index))
            .collect();
        
        Err(format!(
            "Tile not found at level {} pixel coordinates ({}, {}). Available tiles at this level: {}",
            level, pixel_x, pixel_y,
            if tiles_at_level.is_empty() { "none".to_string() } else { tiles_at_level.join(", ") }
        ))
    }
}

#[tauri::command]
pub async fn get_sample_file_path(app: tauri::AppHandle) -> Result<String, String> {
    // Try to get the resource path first (for bundled app)
    if let Some(resource_path) = app.path_resolver().resolve_resource("sample.kfb") {
        if resource_path.exists() {
            return Ok(resource_path.to_string_lossy().to_string());
        }
    }
    
    // Try multiple possible paths for the sample file
    let possible_paths = vec![
        "/Users/hugh/bitroc/kfb-inspector/public/sample.kfb".to_string(),
        std::env::current_dir()
            .map(|d| d.join("public").join("sample.kfb").to_string_lossy().to_string())
            .unwrap_or_default(),
        std::env::current_dir()
            .map(|d| d.join("..").join("public").join("sample.kfb").to_string_lossy().to_string())
            .unwrap_or_default(),
        std::env::current_dir()
            .map(|d| d.join("dist").join("sample.kfb").to_string_lossy().to_string())
            .unwrap_or_default(),
    ];
    
    for path in possible_paths {
        if !path.is_empty() && std::path::Path::new(&path).exists() {
            return Ok(path);
        }
    }
    
    Err("Sample file not found in any expected location".to_string())
}