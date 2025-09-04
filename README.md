# KFB Inspector

A modern desktop application built with Tauri (Rust + React + TypeScript) for viewing and inspecting KFB (KFBIO) microscopy files. Designed to handle large files (1GB+) efficiently with native performance.

![KFB Inspector](https://img.shields.io/badge/Tauri-FFC131?logo=Tauri&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?logo=React&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=TypeScript&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-000000?logo=Rust&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)

## Features

### 🗂️ **Structured File Navigation**
- **Hierarchical Tree View**: Browse KFB file structure with expandable/collapsible nodes
- **Smart Icons**: Visual indicators for different data types (folders, images, tiles, errors)
- **Quick Selection**: Click any node to view its detailed information

### 🔍 **Comprehensive Content Inspection**
- **File Header Analysis**: Complete metadata including dimensions, tile count, zoom levels
- **Associated Images**: View macro, label, and preview image information
- **Tile Organization**: Browse tiles organized by zoom level with detailed properties
- **Raw Data Access**: Hex dump viewer for low-level data inspection

### 🎨 **Modern UI/UX**
- **Resizable Panels**: Drag to adjust sidebar and content area sizes
- **Dark/Light Theme Support**: Modern shadcn/ui components with Tailwind CSS v4
- **Drag & Drop**: Simply drag KFB files into the application
- **Responsive Design**: Clean, professional interface optimized for desktop use

### ⚡ **High Performance**
- **Rust Backend**: Native speed for parsing large binary files
- **Memory Mapping**: Efficient handling of GB-sized files without loading entirely into RAM
- **Lazy Loading**: Load data on-demand for optimal performance
- **TypeScript Frontend**: Type-safe React components for reliable UI

## Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or later)
- [Rust](https://rustup.rs/) (latest stable)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd kfb-inspector
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm run tauri dev
   ```

4. **Build for production**
   ```bash
   npm run tauri build
   ```

## Usage

### Opening Files
- **File Menu**: Click "Open KFB File" button in the toolbar
- **Drag & Drop**: Drag any `.kfb` file into the application window
- **File Validation**: Automatic validation ensures only valid KFB files are processed

### Navigation
- **File Tree**: Left sidebar shows the complete file structure
- **Expandable Nodes**: Click arrows or folder icons to expand/collapse sections
- **Content Viewer**: Right panel displays detailed information for selected nodes
- **Resizable Layout**: Drag the separator to adjust panel sizes

### Data Inspection
- **Header Information**: View file metadata, dimensions, and scan parameters
- **Associated Images**: Inspect macro, label, and preview images with size and offset info
- **Tile Analysis**: Browse tiles by zoom level with position and size details
- **Hex Dump**: Raw binary data viewer for low-level file analysis

## KFB File Format

The application supports the KFBIO file format commonly used in digital microscopy:

- **Magic Number**: `KFB` identifier at offset 4
- **Multi-level Structure**: Pyramid of tiles at different zoom levels
- **JPEG Compression**: Tiles are JPEG-compressed for efficient storage
- **Associated Images**: Macro, label, and preview images for navigation
- **Binary Format**: Little-endian binary structure with specific offsets

## Architecture

### Backend (Rust)
- **`src-tauri/src/main.rs`**: Main application entry point
- **`src-tauri/src/kfb.rs`**: KFB file parser implementation
- **`src-tauri/src/commands.rs`**: Tauri command handlers for frontend communication

### Frontend (React + TypeScript)
- **`src/App.tsx`**: Main application component with file handling
- **`src/components/FileTree.tsx`**: Tree view component for file structure
- **`src/components/ContentViewer.tsx`**: Content display component
- **`src/components/ui/`**: shadcn/ui component library

### Key Technologies
- **Tauri**: Cross-platform desktop app framework
- **Memory Mapping**: Efficient large file handling with `memmap2`
- **Tailwind CSS v4**: Modern utility-first CSS framework
- **shadcn/ui**: High-quality React component library
- **Lucide React**: Beautiful icon system

## File Support

- **Format**: KFB (KFBIO) files with `.kfb` extension
- **Size**: Optimized for large files (1GB+)
- **Compression**: JPEG-compressed tiles
- **Structure**: Multi-level tile pyramids with associated images

## Development

### Project Structure
```
kfb-inspector/
├── src-tauri/          # Rust backend
│   ├── src/
│   │   ├── main.rs     # Main entry point
│   │   ├── kfb.rs      # KFB parser
│   │   └── commands.rs # Tauri commands
│   └── Cargo.toml      # Rust dependencies
├── src/                # React frontend
│   ├── components/     # React components
│   ├── lib/           # Utility functions
│   └── types.ts       # TypeScript definitions
├── package.json        # Node.js dependencies
└── tailwind.config.js  # Tailwind CSS configuration
```

### Development Commands
```bash
npm run dev          # Start development server
npm run build        # Build frontend
npm run tauri dev    # Run Tauri development mode
npm run tauri build  # Build production app
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Tauri](https://tauri.app/) framework
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)
- Inspired by the OpenSlide project's KFB format specification