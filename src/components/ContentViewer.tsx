import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Loader2, ExternalLink, Image as ImageIcon, FileText, Layers2, AlertCircle } from 'lucide-react';
import { TreeNode, KfbData } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableRow } from './ui/table';
import { Button } from './ui/button';

interface ContentViewerProps {
  node: TreeNode | null;
  filePath: string | null;
  onNodeSelect?: (node: TreeNode) => void;
}

const ContentViewer: React.FC<ContentViewerProps> = ({ node, filePath, onNodeSelect }) => {
  const [hexDump, setHexDump] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Container width state for responsive tile sizing
  const [containerWidth, setContainerWidth] = useState<number>(600);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Tile image states
  const [tileImage, setTileImage] = useState<string>('');
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string>('');

  // Associated image states
  const [associatedImage, setAssociatedImage] = useState<string>('');
  const [associatedImageLoading, setAssociatedImageLoading] = useState(false);
  const [associatedImageError, setAssociatedImageError] = useState<string>('');

  // Tile preview states for hover cards
  const [tilePreviewCache, setTilePreviewCache] = useState<Map<number, string>>(new Map());
  const [loadingTilePreviews, setLoadingTilePreviews] = useState<Set<number>>(new Set());

  useEffect(() => {
    // Clear image states when switching nodes
    setTileImage('');
    setImageError('');
    setImageLoading(false);
    setAssociatedImage('');
    setAssociatedImageError('');
    setAssociatedImageLoading(false);

    if (node && filePath && needsHexDump(node)) {
      loadHexDump(node);
    }

    // Load tile image if this is a tile node
    if (node && filePath && node.type === 'tile') {
      loadTileImage(node);
    }

    // Load associated image if this is an associated image node
    if (node && filePath && node.type === 'associated-image') {
      loadAssociatedImage(node);
    }
  }, [node, filePath]);

  // Effect to observe container width changes
  useEffect(() => {
    const observeContainer = () => {
      if (containerRef.current) {
        const updateWidth = () => {
          if (containerRef.current) {
            const width = containerRef.current.offsetWidth;
            setContainerWidth(width);
          }
        };

        // Initial measurement
        updateWidth();

        // Set up ResizeObserver for dynamic updates
        const resizeObserver = new ResizeObserver(updateWidth);
        resizeObserver.observe(containerRef.current);

        return () => resizeObserver.disconnect();
      }
    };

    return observeContainer();
  }, [node]); // Re-observe when node changes

  const needsHexDump = (node: TreeNode): boolean => {
    return ['associated-image', 'tile', 'raw-data'].includes(node.type);
  };

  const formatScanTime = (scanTime: number): string => {
    try {
      // Convert from potential Unix timestamp (seconds or milliseconds)
      let timestamp = scanTime;

      // If the number is very large, it might be in milliseconds
      // If it's smaller, it might be in seconds
      // Unix timestamps around 2020-2025 range from ~1.6B to ~1.7B seconds
      if (timestamp > 1e12) {
        // Likely milliseconds, convert to seconds
        timestamp = timestamp / 1000;
      }

      const date = new Date(timestamp * 1000);

      // Check if the date is valid and reasonable (between 1970 and 2100)
      if (isNaN(date.getTime()) || date.getFullYear() < 1970 || date.getFullYear() > 2100) {
        return 'Invalid timestamp';
      }

      return date.toLocaleString();
    } catch (error) {
      return 'Invalid timestamp';
    }
  };

  const formatSpendTime = (spendTime: number): string => {
    if (spendTime < 0) {
      return 'Invalid';
    }

    // Based on evidence: spend_time is in milliseconds (e.g., 9000 = 9 seconds)
    const totalSeconds = spendTime / 1000;

    // Convert to hours, minutes, seconds
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = spendTime % 1000;

    let result = '';
    if (hours > 0) {
      result = `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      result = `${minutes}m ${seconds}s`;
    } else if (seconds > 0) {
      result = `${seconds}s`;
      if (milliseconds > 0) {
        result += ` ${milliseconds}ms`;
      }
    } else {
      result = `${spendTime}ms`;
    }

    return result;
  };

  const loadHexDump = async (node: TreeNode) => {
    if (!filePath) return;

    setLoading(true);
    try {
      let offset = 0;
      let length = 256;

      if (node.type === 'associated-image') {
        offset = node.data.data_offset;
      } else if (node.type === 'tile') {
        offset = node.data.data_offset;
      }

      const dump = await invoke<string>('get_hex_dump', {
        filePath,
        offset,
        length
      });
      setHexDump(dump);
    } catch (error) {
      console.error('Failed to load hex dump:', error);
      setHexDump('Error loading hex dump');
    }
    setLoading(false);
  };

  const loadTileImage = async (node: TreeNode) => {
    if (!filePath || node.type !== 'tile') return;

    setImageLoading(true);
    setImageError('');
    setTileImage('');

    try {
      const base64Data = await invoke<string>('decode_tile_image', {
        filePath,
        tileIndex: node.data.index
      });
      setTileImage(base64Data);
    } catch (error) {
      setImageError(`Failed to decode tile image: ${error}`);
      console.error('Failed to decode tile image:', error);
    }
    setImageLoading(false);
  };

  const loadAssociatedImage = async (node: TreeNode) => {
    if (!filePath || node.type !== 'associated-image') return;

    setAssociatedImageLoading(true);
    setAssociatedImageError('');
    setAssociatedImage('');

    try {
      const base64Data = await invoke<string>('decode_associated_image', {
        filePath,
        imageName: node.data.name
      });
      setAssociatedImage(base64Data);
    } catch (error) {
      setAssociatedImageError(`Failed to decode associated image: ${error}`);
      console.error('Failed to decode associated image:', error);
    }
    setAssociatedImageLoading(false);
  };

  const loadTilePreview = async (tileIndex: number) => {
    if (!filePath || tilePreviewCache.has(tileIndex) || loadingTilePreviews.has(tileIndex)) {
      return;
    }

    setLoadingTilePreviews(prev => new Set(prev).add(tileIndex));

    try {
      const base64Data = await invoke<string>('decode_tile_image', {
        filePath,
        tileIndex
      });
      setTilePreviewCache(prev => new Map(prev).set(tileIndex, base64Data));
    } catch (error) {
      console.error(`Failed to load tile preview for ${tileIndex}:`, error);
      // Set empty string to indicate failed load and prevent retries
      setTilePreviewCache(prev => new Map(prev).set(tileIndex, ''));
    } finally {
      setLoadingTilePreviews(prev => {
        const newSet = new Set(prev);
        newSet.delete(tileIndex);
        return newSet;
      });
    }
  };

  // TileCard component with hover functionality
  const TileCard: React.FC<{ tile: any; onNavigate: (tile: any) => void; size?: number }> = ({ tile, onNavigate, size = 80 }) => {
    const [isHovering, setIsHovering] = useState(false);
    const [showCard, setShowCard] = useState(false);
    const [cardPosition, setCardPosition] = useState({ x: 0, y: 0 });
    const tileRef = React.useRef<HTMLDivElement>(null);
    const tilePreview = tilePreviewCache.get(tile.index);
    const isLoadingPreview = loadingTilePreviews.has(tile.index);

    const handleMouseEnter = () => {
      setIsHovering(true);
      setShowCard(true); // Show card immediately
      loadTilePreview(tile.index); // Start loading preview
      
      // Calculate card position to avoid clipping
      if (tileRef.current) {
        const rect = tileRef.current.getBoundingClientRect();
        const cardWidth = 256; // 64 * 4 (w-64)
        const cardHeight = 200; // Approximate height
        
        // Position to the right of the tile, but adjust if it would clip
        let x = rect.right + 8;
        let y = rect.top - 8;
        
        // Adjust horizontally if it would go off screen
        if (x + cardWidth > window.innerWidth) {
          x = rect.left - cardWidth - 8; // Position to the left instead
        }
        
        // Adjust vertically if it would go off screen
        if (y + cardHeight > window.innerHeight) {
          y = window.innerHeight - cardHeight - 8;
        }
        if (y < 8) {
          y = 8;
        }
        
        setCardPosition({ x, y });
      }
    };

    const handleMouseLeave = () => {
      setIsHovering(false);
      setTimeout(() => setShowCard(false), 100); // Small delay for smoother UX
    };

    const handleClick = () => {
      onNavigate(tile);
    };

    const formatFileSize = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    return (
      <div
        className="relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Tile card */}
        <div
          ref={tileRef}
          className="border border-border rounded bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer relative overflow-hidden group"
          style={{ width: size, height: size }}
        >
          <div className="p-1 h-full flex flex-col justify-between">
            <div className="flex items-center justify-center flex-1">
              {/* Use a simple CSS-based icon instead of SVG for performance */}
              <div
                className="bg-muted-foreground/40 group-hover:bg-foreground/60 transition-colors rounded-sm"
                style={{
                  width: Math.max(8, size * 0.25),
                  height: Math.max(8, size * 0.25),
                  clipPath: 'polygon(0% 15%, 15% 15%, 15% 0%, 85% 0%, 85% 15%, 100% 15%, 100% 85%, 85% 85%, 85% 100%, 15% 100%, 15% 85%, 0% 85%)'
                }}
              />
            </div>
            {size > 30 && (
              <div className="text-xs font-medium text-center truncate">
                #{tile.index}
              </div>
            )}
          </div>
        </div>

        {/* Hover card */}
        {showCard && isHovering && (
          <div className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg p-3 w-64 pointer-events-none"
               style={{
                 left: `${cardPosition.x}px`,
                 top: `${cardPosition.y}px`
               }}>
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Tile {tile.index}</h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClick}
                  className="h-6 px-2 text-xs"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  View
                </Button>
              </div>

              {/* Image preview */}
              <div className="aspect-square bg-muted/30 rounded-md overflow-hidden">
                {isLoadingPreview ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : tilePreview && tilePreview !== '' ? (
                  <img
                    src={`data:image/jpeg;base64,${tilePreview}`}
                    alt={`Tile ${tile.index} preview`}
                    className="w-full h-full object-cover"
                    onError={() => {
                      setTilePreviewCache(prev => new Map(prev).set(tile.index, ''));
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Position:</span>
                  <span>{tile.pos_x}, {tile.pos_y}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Size:</span>
                  <span>{tile.tile_width}×{tile.tile_height}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data:</span>
                  <span>{formatFileSize(tile.length)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Offset:</span>
                  <span className="font-mono">0x{tile.data_offset.toString(16).toUpperCase()}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!node) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-muted-foreground">Select a node from the file structure</div>
      </div>
    );
  }

  const renderRoot = (data: KfbData) => (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>File Summary</CardTitle>
          <CardDescription>General information about the KFB file</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow><TableCell className="font-medium">Format</TableCell><TableCell>KFB (KFBIO)</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Base Dimensions</TableCell><TableCell>{data.header.base_width} × {data.header.base_height}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Zoom Levels</TableCell><TableCell>{data.header.zoom_levels}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Total Tiles</TableCell><TableCell>{data.header.tile_count}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Tile Size</TableCell><TableCell>{data.header.tile_size} × {data.header.tile_size}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Compression</TableCell><TableCell>{data.header.compression}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Scan Scale</TableCell><TableCell>{data.header.scan_scale}×</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Associated Images</CardTitle>
          <CardDescription>Additional images stored in the file</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {data.associated_images.map(img => (
                <TableRow key={img.name}>
                  <TableCell className="font-medium">{img.name.charAt(0).toUpperCase() + img.name.slice(1)}</TableCell>
                  <TableCell>
                    {img.error ? 'Error or missing' : `${img.width} × ${img.height} (${img.length} bytes)`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  const renderHeader = (data: any) => (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Header Information</CardTitle>
          <CardDescription>File header metadata and properties</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow><TableCell className="font-medium">Magic Number</TableCell><TableCell>{data.magic}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Base Width</TableCell><TableCell>{data.base_width}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Base Height</TableCell><TableCell>{data.base_height}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Tile Count</TableCell><TableCell>{data.tile_count}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Zoom Levels</TableCell><TableCell>{data.zoom_levels}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Tile Size</TableCell><TableCell>{data.tile_size}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Compression</TableCell><TableCell>{data.compression}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Scan Scale</TableCell><TableCell>{data.scan_scale}×</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Image Capture Resolution</TableCell><TableCell>{data.image_cap_res}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Spend Time</TableCell><TableCell>{data.spend_time}ms ({formatSpendTime(data.spend_time)})</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Scan Time</TableCell><TableCell>{data.scan_time} ({formatScanTime(data.scan_time)})</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  const renderOffsets = (data: any) => (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Data Section Offsets</CardTitle>
          <CardDescription>File pointer locations for different data sections</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow><TableCell className="font-medium">Macro Image Info</TableCell><TableCell className="font-mono">0x{data.macro_info_offset.toString(16).toUpperCase()}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Label Image Info</TableCell><TableCell className="font-mono">0x{data.label_info_offset.toString(16).toUpperCase()}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Preview Image Info</TableCell><TableCell className="font-mono">0x{data.preview_info_offset.toString(16).toUpperCase()}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Tiles Info</TableCell><TableCell className="font-mono">0x{data.tiles_info_offset.toString(16).toUpperCase()}</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  const renderAssociatedImage = (data: any) => (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Image Information</CardTitle>
          <CardDescription>Details about the {data.name} image</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow><TableCell className="font-medium">Name</TableCell><TableCell>{data.name}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Width</TableCell><TableCell>{data.width}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Height</TableCell><TableCell>{data.height}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Data Size</TableCell><TableCell>{data.length} bytes</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Data Offset</TableCell><TableCell className="font-mono">0x{data.data_offset.toString(16).toUpperCase()}</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Associated Image Display */}
      <Card>
        <CardHeader>
          <CardTitle>Image Preview</CardTitle>
          <CardDescription>Visual representation of the {data.name} image</CardDescription>
        </CardHeader>
        <CardContent>
          {associatedImageLoading && (
            <div className="flex items-center justify-center h-64 border-2 border-dashed border-muted-foreground/25 rounded-md">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading image...</span>
              </div>
            </div>
          )}

          {associatedImageError && (
            <div className="flex items-center justify-center h-64 border-2 border-dashed border-destructive/25 rounded-md">
              <div className="text-center text-destructive">
                <p className="font-medium">Failed to load image</p>
                <p className="text-sm mt-1">{associatedImageError}</p>
              </div>
            </div>
          )}

          {!associatedImageLoading && !associatedImageError && associatedImage && (
            <div className="space-y-4">
              <div className="border rounded-md overflow-hidden">
                <img
                  src={`data:image/jpeg;base64,${associatedImage}`}
                  alt={`${data.name} image`}
                  className="max-w-full h-auto"
                  onError={() => setAssociatedImageError('Invalid image format or corrupted data')}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Showing {data.name} image ({data.width} × {data.height} pixels)
              </div>
            </div>
          )}

          {!associatedImageLoading && !associatedImageError && !associatedImage && data.error && (
            <div className="flex items-center justify-center h-32 border-2 border-dashed border-muted-foreground/25 rounded-md">
              <div className="text-center text-muted-foreground">
                <p>Image not available</p>
                <p className="text-sm mt-1">{data.error}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && hexDump && (
        <Card>
          <CardHeader>
            <CardTitle>Raw Data Preview</CardTitle>
            <CardDescription>Hexadecimal dump of the image data</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono bg-muted p-4 rounded-md overflow-x-auto whitespace-pre">{hexDump}</pre>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading hex dump...</span>
        </div>
      )}
    </div>
  );

  const renderTile = (data: any) => (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tile Information</CardTitle>
          <CardDescription>Details about tile #{data.index}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow><TableCell className="font-medium">Index</TableCell><TableCell>{data.index}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Zoom Level</TableCell><TableCell>{data.zoom_level}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">ID</TableCell><TableCell>{data.id}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Position</TableCell><TableCell>{data.pos_x}, {data.pos_y}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Dimensions</TableCell><TableCell>{data.tile_width} × {data.tile_height}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Data Size</TableCell><TableCell>{data.length} bytes</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Data Offset</TableCell><TableCell className="font-mono">0x{data.data_offset.toString(16).toUpperCase()}</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Tile Image Display */}
      <Card>
        <CardHeader>
          <CardTitle>Tile Image</CardTitle>
          <CardDescription>Decoded tile visualization</CardDescription>
        </CardHeader>
        <CardContent>
          {imageLoading && (
            <div className="flex items-center justify-center h-64 border-2 border-dashed border-muted-foreground/25 rounded-md">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Decoding tile image...</span>
              </div>
            </div>
          )}

          {imageError && (
            <div className="flex items-center justify-center h-64 border-2 border-dashed border-destructive/25 rounded-md">
              <div className="text-center text-destructive">
                <p className="font-medium">Failed to load tile image</p>
                <p className="text-sm mt-1">{imageError}</p>
              </div>
            </div>
          )}

          {!imageLoading && !imageError && tileImage && (
            <div className="space-y-4">
              <div className="border rounded-md overflow-hidden">
                <img
                  src={`data:image/jpeg;base64,${tileImage}`}
                  alt={`Tile ${data.index}`}
                  className="max-w-full h-auto"
                  onError={() => setImageError('Invalid image format or corrupted data')}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Showing decoded tile image data. The actual format depends on the compression method used.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && hexDump && (
        <Card>
          <CardHeader>
            <CardTitle>Raw Data Preview</CardTitle>
            <CardDescription>Hexadecimal dump of the tile data</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono bg-muted p-4 rounded-md overflow-x-auto whitespace-pre">{hexDump}</pre>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading hex dump...</span>
        </div>
      )}
    </div>
  );

  const renderZoomLevel = (data: any) => {
    const totalSize = data.tiles.reduce((sum: number, tile: any) => sum + tile.length, 0);
    const avgSize = totalSize / data.tiles.length;

    const formatFileSize = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const handleTileNavigate = (tile: any) => {
      if (onNodeSelect) {
        // Create a tile node to navigate to
        const tileNode: TreeNode = {
          id: `tile-${tile.index}`,
          label: `Tile ${tile.index} (${tile.tile_width}×${tile.tile_height})`,
          type: 'tile',
          data: tile
        };
        onNodeSelect(tileNode);
      }
    };

    // Calculate spatial grid layout based on tile positions
    const calculateSpatialGrid = () => {
      if (!data.tiles.length) return { grid: [], gridWidth: 0, gridHeight: 0, tileSize: 0 };

      // Find the bounds of all tiles
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let commonTileWidth = 0, commonTileHeight = 0;

      data.tiles.forEach((tile: any) => {
        minX = Math.min(minX, tile.pos_x);
        minY = Math.min(minY, tile.pos_y);
        maxX = Math.max(maxX, tile.pos_x + tile.tile_width);
        maxY = Math.max(maxY, tile.pos_y + tile.tile_height);

        if (commonTileWidth === 0) {
          commonTileWidth = tile.tile_width;
          commonTileHeight = tile.tile_height;
        }
      });

      // Calculate grid dimensions based on tile positions
      const gridCols = Math.ceil((maxX - minX) / commonTileWidth);
      const gridRows = Math.ceil((maxY - minY) / commonTileHeight);

      // Create empty grid
      const grid: (any | null)[][] = Array(gridRows).fill(null).map(() => Array(gridCols).fill(null));

      // Place tiles in their correct positions
      data.tiles.forEach((tile: any) => {
        const col = Math.floor((tile.pos_x - minX) / commonTileWidth);
        const row = Math.floor((tile.pos_y - minY) / commonTileHeight);

        if (row >= 0 && row < gridRows && col >= 0 && col < gridCols) {
          grid[row][col] = tile;
        }
      });

      return {
        grid,
        gridWidth: gridCols,
        gridHeight: gridRows,
        tileSize: Math.min(commonTileWidth, commonTileHeight)
      };
    };

    const { grid, gridWidth, gridHeight, tileSize } = calculateSpatialGrid();

    // Calculate appropriate display size for tiles based on available space
    const minTileSize = 20; // Minimum readable size
    const maxTileSize = 100; // Maximum size for good UX
    const maxGridHeight = 400; // Maximum height for the grid display
    const containerPadding = 40; // Account for container padding and borders

    // Calculate available width (subtract padding/margins)
    const availableWidth = Math.max(300, containerWidth - containerPadding);

    // Calculate tile size based on both width and height constraints
    const widthBasedSize = Math.floor(availableWidth / Math.max(gridWidth, 1));
    const heightBasedSize = Math.floor(maxGridHeight / Math.max(gridHeight, 1));

    const displayTileSize = Math.max(
      minTileSize,
      Math.min(maxTileSize, widthBasedSize, heightBasedSize)
    );

    return (
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Level Information</CardTitle>
            <CardDescription>Overview of zoom level {data.level}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow><TableCell className="font-medium">Zoom Level</TableCell><TableCell>{data.level}</TableCell></TableRow>
                <TableRow><TableCell className="font-medium">Tile Count</TableCell><TableCell>{data.tiles.length}</TableCell></TableRow>
                <TableRow><TableCell className="font-medium">Grid Size</TableCell><TableCell>{gridWidth} × {gridHeight}</TableCell></TableRow>
                <TableRow><TableCell className="font-medium">Tile Size</TableCell><TableCell>{tileSize} pixels</TableCell></TableRow>
                <TableRow><TableCell className="font-medium">Total Data Size</TableCell><TableCell>{formatFileSize(totalSize)}</TableCell></TableRow>
                <TableRow><TableCell className="font-medium">Average Tile Size</TableCell><TableCell>{formatFileSize(Math.round(avgSize))}</TableCell></TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spatial Tile Layout</CardTitle>
            <CardDescription>Tiles positioned as they appear in the actual image. Hover for previews, click to view details.</CardDescription>
          </CardHeader>
          <CardContent ref={containerRef}>
            <div className="w-full flex flex-col items-center">
              <div
                className="w-full border border-border/50 bg-muted/10 p-2 overflow-auto"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${gridWidth}, ${displayTileSize}px)`,
                  gridTemplateRows: `repeat(${gridHeight}, ${displayTileSize}px)`,
                  gap: '1px',
                  justifyContent: 'center'
                }}
              >
                {grid.flat().map((tile, index) => {
                  const row = Math.floor(index / gridWidth);
                  const col = index % gridWidth;

                  return tile ? (
                    <div key={tile.index} className="relative">
                      <TileCard tile={tile} onNavigate={handleTileNavigate} size={displayTileSize} />
                    </div>
                  ) : (
                    <div
                      key={`empty-${row}-${col}`}
                      className="bg-muted/20 border border-muted-foreground/10 rounded opacity-50"
                      style={{ width: displayTileSize, height: displayTileSize }}
                    />
                  );
                })}
              </div>

              <div className="mt-4 text-center space-y-1">
                <div className="text-sm text-muted-foreground">
                  Spatial grid: {gridWidth} × {gridHeight} = {gridWidth * gridHeight} positions
                </div>
                <div className="text-xs text-muted-foreground">
                  {data.tiles.length} tiles positioned, {(gridWidth * gridHeight) - data.tiles.length} empty spaces
                </div>
                {displayTileSize < 40 && (
                  <div className="text-xs text-yellow-600">
                    Grid scaled down for display. Use search to find specific tiles.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderRawData = (data: KfbData) => (
    <div className="p-6 space-y-6">
      {!loading && hexDump && (
        <Card>
          <CardHeader>
            <CardTitle>File Beginning</CardTitle>
            <CardDescription>First 256 bytes of raw file data</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono bg-muted p-4 rounded-md overflow-x-auto whitespace-pre">{hexDump}</pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>File Statistics</CardTitle>
          <CardDescription>General file information</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow><TableCell className="font-medium">Header Size</TableCell><TableCell>~88 bytes</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Total Tiles</TableCell><TableCell>{data.tiles.length}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Associated Images</TableCell><TableCell>{data.associated_images.length}</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading hex dump...</span>
        </div>
      )}
    </div>
  );

  const renderError = (data: any) => (
    <div className="p-6">
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
          <CardDescription>An error occurred while processing this item</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-destructive">{data.error}</div>
        </CardContent>
      </Card>
    </div>
  );

  const renderFolder = (node: TreeNode) => {
    if (!node.children || node.children.length === 0) {
      return (
        <div className="p-6 flex items-center justify-center h-full">
          <div className="text-muted-foreground">This folder is empty</div>
        </div>
      );
    }

    const formatFileSize = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const getNodeTypeIcon = (nodeType: string) => {
      switch (nodeType) {
        case 'header-props':
          return <FileText className="h-4 w-4" />;
        case 'offsets':
          return <FileText className="h-4 w-4" />;
        case 'associated-image':
          return <ImageIcon className="h-4 w-4" />;
        case 'tile':
          return <ImageIcon className="h-4 w-4" />;
        case 'zoom-level':
          return <Layers2 className="h-4 w-4" />;
        case 'error':
          return <AlertCircle className="h-4 w-4 text-destructive" />;
        default:
          return <FileText className="h-4 w-4" />;
      }
    };

    const getNodeStats = (child: TreeNode) => {
      switch (child.type) {
        case 'associated-image':
          if (child.data?.error) {
            return 'Error or missing';
          }
          return `${child.data?.width}×${child.data?.height} • ${formatFileSize(child.data?.length || 0)}`;
        case 'tile':
          return `${child.data?.tile_width}×${child.data?.tile_height} • ${formatFileSize(child.data?.length || 0)}`;
        case 'zoom-level':
          const tileCount = child.data?.tiles?.length || 0;
          const totalSize = child.data?.tiles?.reduce((sum: number, tile: any) => sum + tile.length, 0) || 0;
          return `${tileCount} tiles • ${formatFileSize(totalSize)}`;
        default:
          return '';
      }
    };

    return (
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{node.label.split(' •')[0]}</CardTitle>
            <CardDescription>
              {node.id === 'header' && 'File header information and metadata'}
              {node.id === 'images' && 'Associated images stored in the KFB file'}
              {node.id === 'tiles' && 'Tile pyramid data organized by zoom levels'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {node.children.map((child) => (
                <div
                  key={child.id}
                  className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                  onClick={() => onNodeSelect && onNodeSelect(child)}
                >
                  <div className="flex-shrink-0">
                    {getNodeTypeIcon(child.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {child.label.split(' •')[0]}
                    </div>
                    {getNodeStats(child) && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {getNodeStats(child)}
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  switch (node.type) {
    case 'root':
      return renderRoot(node.data);
    case 'header-props':
      return renderHeader(node.data);
    case 'offsets':
      return renderOffsets(node.data);
    case 'associated-image':
      return renderAssociatedImage(node.data);
    case 'tile':
      return renderTile(node.data);
    case 'zoom-level':
      return renderZoomLevel(node.data);
    case 'raw-data':
      return renderRawData(node.data);
    case 'folder':
      return renderFolder(node);
    case 'error':
      return renderError(node.data);
    default:
      return (
        <div className="p-6 flex items-center justify-center h-full">
          <div className="text-muted-foreground">No content available for this node type: {node.type}</div>
        </div>
      );
  }
};

export default ContentViewer;