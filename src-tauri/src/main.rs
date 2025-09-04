#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod kfb;
mod commands;

use commands::*;
use std::collections::HashMap;
use std::sync::Mutex;

fn main() {
    tauri::Builder::default()
        .manage(Mutex::new(HashMap::<String, kfb::KfbParser>::new()))
        .invoke_handler(tauri::generate_handler![
            open_kfb_file,
            parse_kfb_file,
            read_file_chunk,
            get_hex_dump,
            decode_tile_image,
            decode_associated_image,
            debug_file_header,
            get_sample_file_path,
            get_openseadragon_config,
            get_tile_for_openseadragon
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}