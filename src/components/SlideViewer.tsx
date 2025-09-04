import React, { useEffect, useRef } from 'react';
import OpenSeadragon from 'openseadragon';
import { invoke } from '@tauri-apps/api/tauri';
import { Plus, Minus, Home, Maximize } from 'lucide-react';
import { Button } from './ui/button';
import { useKfbStore } from '../store/kfbStore';

interface SlideViewerProps {
  filePath: string | null;
  width?: string;
  height?: string;
}


const SlideViewer: React.FC<SlideViewerProps> = ({
  filePath,
  width = '100%',
  height = '600px'
}) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const osdViewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const { kfbData } = useKfbStore();

  useEffect(() => {
    if (!filePath || !viewerRef.current || !kfbData) return;

    const initializeViewer = async () => {
      try {
        // Calculate viewer configuration from kfbData
        const tiles = kfbData.tiles;
        const levels = Array.from(new Set(tiles.map(t => t.zoom_level))).sort((a, b) => a - b);
        const minLevel = levels[0] || 0;
        const maxLevel = levels[levels.length - 1] || 0;
        const tileSize = tiles[0]?.tile_width || kfbData.header.tile_size || 256;

        const config = {
          width: kfbData.header.base_width,
          height: kfbData.header.base_height,
          tile_size: tileSize,
          min_level: minLevel,
          max_level: maxLevel
        };

        // Destroy existing viewer if it exists
        if (osdViewerRef.current) {
          osdViewerRef.current.destroy();
          osdViewerRef.current = null;
        }

        // Create custom KFB TileSource
        class KFBTileSource extends (OpenSeadragon as any).TileSource {
          constructor(options: any) {
            super(options);
            this.filePath = options.filePath;
            this.minLevel = options.minLevel || 0;
            this.maxLevel = options.maxLevel || 10;
          }

          getTileUrl(level: number, x: number, y: number): string {
            // This won't actually be used since we override downloadTileStart
            return `kfb-tile://${this.filePath}/${level}/${x}/${y}`;
          }

          downloadTileStart(context: any): boolean {
            const { tile } = context;
            const level = tile.level;
            const x = tile.x;
            const y = tile.y;

            // Get tile from backend
            invoke<string>('get_tile', {
              filePath: this.filePath,
              level: level,
              x: x,
              y: y
            }).then(base64Data => {
              // Convert base64 to blob
              const binaryString = atob(base64Data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const blob = new Blob([bytes], { type: 'image/jpeg' });
              const url = URL.createObjectURL(blob);
              
              // Create image and handle load
              const image = new Image();
              image.onload = () => {
                tile.loading = false;
                tile.loaded = true;
                this.finishDownloading(context, image);
                URL.revokeObjectURL(url);
              };
              image.onerror = () => {
                tile.loading = false;
                tile.exists = false;
                this.finishDownloading(context, null);
                URL.revokeObjectURL(url);
              };
              image.src = url;
            }).catch(error => {
              console.error(`Failed to load tile ${level}/${x}/${y}:`, error);
              tile.loading = false;
              tile.exists = false;
              this.finishDownloading(context, null);
            });

            return true; // We're handling the download ourselves
          }

          finishDownloading(context: any, image: HTMLImageElement | null) {
            const { callback } = context;
            if (callback) {
              callback(image, null, image ? null : 'Failed to load tile');
            }
          }
        }

        const tileSource = new KFBTileSource({
          width: config.width,
          height: config.height,
          tileSize: config.tile_size,
          overlap: 0,
          minLevel: config.min_level,
          maxLevel: config.max_level,
          filePath: filePath
        });

        // No more AJAX interception needed - using custom TileSource

        // Initialize OpenSeadragon viewer
        osdViewerRef.current = OpenSeadragon({
          element: viewerRef.current!,
          prefixUrl: '', // We don't need default button images
          tileSources: tileSource,
          showNavigator: true,
          navigatorPosition: 'BOTTOM_RIGHT',
          navigatorSizeRatio: 0.15,
          showRotationControl: true,
          showHomeControl: true,
          showZoomControl: true,
          showFullPageControl: true,
          gestureSettingsMouse: {
            clickToZoom: true,
            dblClickToZoom: true,
            pinchToZoom: true,
            flickEnabled: true,
            flickMinSpeed: 120,
            flickMomentum: 0.25
          },
          gestureSettingsTouch: {
            clickToZoom: true,
            dblClickToZoom: true,
            pinchToZoom: true,
            flickEnabled: true,
            flickMinSpeed: 120,
            flickMomentum: 0.25
          },
          zoomInButton: 'zoom-in-btn',
          zoomOutButton: 'zoom-out-btn',
          homeButton: 'home-btn',
          fullPageButton: 'full-page-btn',
          nextButton: 'next-btn',
          previousButton: 'previous-btn'
        });

        // Add event listeners
        osdViewerRef.current.addHandler('open', () => {
          console.log('OpenSeadragon viewer opened successfully');
        });

        osdViewerRef.current.addHandler('open-failed', (event: any) => {
          console.error('Failed to open OpenSeadragon viewer:', event);
        });

        osdViewerRef.current.addHandler('tile-load-failed', (event: any) => {
          console.warn('Tile load failed:', event);
        });

      } catch (error) {
        console.error('Failed to initialize OpenSeaDragon viewer:', error);
      }
    };

    initializeViewer();

    // Cleanup function
    return () => {
      if (osdViewerRef.current) {
        osdViewerRef.current.destroy();
        osdViewerRef.current = null;
      }
    };
  }, [filePath, kfbData]);

  if (!filePath) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center bg-muted/20 rounded-md border-2 border-dashed border-muted"
      >
        <p className="text-muted-foreground">No KFB file loaded</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Custom control buttons */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <Button
          id="zoom-in-btn"
          variant="outline"
          size="icon"
          title="Zoom in"
        >
          <Plus className="w-3 h-3 mx-auto" />
        </Button>
        <Button
          id="zoom-out-btn"
          variant="outline"
          size="icon"
          title="Zoom out"
        >
          <Minus className="w-3 h-3 mx-auto" />
        </Button>
        <Button
          id="home-btn"
          variant="outline"
          size="icon"
          title="Go home"
        >
          <Home className="w-3 h-3 mx-auto" />
        </Button>
        <Button
          id="full-page-btn"
          variant="outline"
          size="icon"
          title="Toggle full page"
        >
          <Maximize className="w-3 h-3 mx-auto" />
        </Button>
      </div>

      {/* OpenSeadragon container */}
      <div
        ref={viewerRef}
        style={{ width, height }}
        className="border rounded-md bg-background"
      />
    </div>
  );
};

export default SlideViewer;