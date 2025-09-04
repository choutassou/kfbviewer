import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Loader2 } from 'lucide-react';
import { TreeNode, KfbData } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

interface ContentViewerProps {
  node: TreeNode | null;
  filePath: string | null;
}

const ContentViewer: React.FC<ContentViewerProps> = ({ node, filePath }) => {
  const [hexDump, setHexDump] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (node && filePath && needsHexDump(node)) {
      loadHexDump(node);
    }
  }, [node, filePath]);

  const needsHexDump = (node: TreeNode): boolean => {
    return ['associated-image', 'tile', 'raw-data'].includes(node.type);
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
              <TableRow><TableCell className="font-medium">Spend Time</TableCell><TableCell>{data.spend_time}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Scan Time</TableCell><TableCell>{data.scan_time}</TableCell></TableRow>
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

  const renderTile = (data: any) => {
    const [tileImage, setTileImage] = useState<string>('');
    const [imageLoading, setImageLoading] = useState(false);
    const [imageError, setImageError] = useState<string>('');

    const loadTileImage = async () => {
      if (!filePath) return;
      
      setImageLoading(true);
      setImageError('');
      try {
        const base64Data = await invoke<string>('decode_tile_image', {
          filePath,
          tileIndex: data.index
        });
        setTileImage(base64Data);
      } catch (error) {
        setImageError(`Failed to decode tile image: ${error}`);
        console.error('Failed to decode tile image:', error);
      }
      setImageLoading(false);
    };

    // Load tile image when component mounts
    useEffect(() => {
      loadTileImage();
    }, [data.index, filePath]);

    return (
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
  };

  const renderZoomLevel = (data: any) => {
    const totalSize = data.tiles.reduce((sum: number, tile: any) => sum + tile.length, 0);
    const avgSize = totalSize / data.tiles.length;
    
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
                <TableRow><TableCell className="font-medium">Total Data Size</TableCell><TableCell>{totalSize} bytes</TableCell></TableRow>
                <TableRow><TableCell className="font-medium">Average Tile Size</TableCell><TableCell>{Math.round(avgSize)} bytes</TableCell></TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Tiles in this Level</CardTitle>
            <CardDescription>Individual tile information</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Index</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Dimensions</TableHead>
                  <TableHead>Data Size</TableHead>
                  <TableHead>Offset</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tiles.map((tile: any) => (
                  <TableRow key={tile.index}>
                    <TableCell>{tile.index}</TableCell>
                    <TableCell>{tile.pos_x}, {tile.pos_y}</TableCell>
                    <TableCell>{tile.tile_width} × {tile.tile_height}</TableCell>
                    <TableCell>{tile.length} bytes</TableCell>
                    <TableCell className="font-mono">0x{tile.data_offset.toString(16).toUpperCase()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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