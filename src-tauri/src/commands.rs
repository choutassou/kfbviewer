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