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
    let parser = KfbParser::new(&file_path).map_err(|e| e.to_string())?;
    let data = parser.parse().map_err(|e| e.to_string())?;
    
    // Store parser for later use
    parsers
        .lock()
        .unwrap()
        .insert(file_path, parser);
    
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
pub async fn get_sample_file_path(app: tauri::AppHandle) -> Result<String, String> {
    // Try to get the resource path first (for bundled app)
    if let Some(resource_path) = app.path_resolver().resolve_resource("sample.kfb") {
        if resource_path.exists() {
            return Ok(resource_path.to_string_lossy().to_string());
        }
    }
    
    // Fallback to development path
    let current_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;
    
    let sample_path = current_dir.join("public").join("sample.kfb");
    
    if sample_path.exists() {
        Ok(sample_path.to_string_lossy().to_string())
    } else {
        Err("Sample file not found".to_string())
    }
}