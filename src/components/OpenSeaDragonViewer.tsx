import React, { useEffect, useRef } from 'react';
import OpenSeadragon from 'openseadragon';
import { invoke } from '@tauri-apps/api/tauri';

interface OpenSeaDragonViewerProps {
  filePath: string | null;
  width?: string;
  height?: string;
}

interface OpenSeaDragonConfig {
  width: number;
  height: number;
  tile_size: number;
  min_level: number;
  max_level: number;
}

const OpenSeaDragonViewer: React.FC<OpenSeaDragonViewerProps> = ({
  filePath,
  width = '100%',
  height = '600px'
}) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const osdViewerRef = useRef<OpenSeadragon.Viewer | null>(null);

  useEffect(() => {
    if (!filePath || !viewerRef.current) return;

    const initializeViewer = async () => {
      try {
        // Get OpenSeaDragon configuration from backend
        const config = await invoke<OpenSeaDragonConfig>('get_openseadragon_config', {
          filePath
        });

        // Destroy existing viewer if it exists
        if (osdViewerRef.current) {
          osdViewerRef.current.destroy();
          osdViewerRef.current = null;
        }

        // Create custom tile source
        const tileSource = {
          height: config.height,
          width: config.width,
          tileSize: config.tile_size,
          minLevel: config.min_level,
          maxLevel: config.max_level,
          getTileUrl: function(level: number, x: number, y: number) {
            // Return a data URL that will be handled by our custom tile loading
            return `kfb-tile://${filePath}/${level}/${x}/${y}`;
          },
          downloadTileStart: function(context: any) {
            const { src, loadWithAjax, callback } = context;
            
            // Parse our custom URL format
            if (src.startsWith('kfb-tile://')) {
              const parts = src.replace('kfb-tile://', '').split('/');
              const [, ...pathParts] = parts;
              const level = parseInt(pathParts[pathParts.length - 3]);
              const x = parseInt(pathParts[pathParts.length - 2]);
              const y = parseInt(pathParts[pathParts.length - 1]);
              
              // Use Tauri invoke to get tile data
              invoke<string>('get_tile_for_openseadragon', {
                filePath,
                level: level,
                x: x,
                y: y
              }).then(base64Data => {
                // Create image from base64 data
                const img = new Image();
                img.onload = () => callback(src, img);
                img.onerror = () => callback(src, null, 'Failed to load tile');
                img.src = `data:image/jpeg;base64,${base64Data}`;
              }).catch(error => {
                callback(src, null, error.toString());
              });
            } else {
              // Fallback to default loading for other URLs
              loadWithAjax(src, function(xhr: XMLHttpRequest) {
                callback(src, xhr.responseText);
              });
            }
          }
        };

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
  }, [filePath]);

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
        <button
          id="zoom-in-btn"
          className="p-2 bg-background border rounded-md shadow-sm hover:bg-accent transition-colors"
          title="Zoom in"
        >
          <span className="sr-only">Zoom in</span>
          +
        </button>
        <button
          id="zoom-out-btn"
          className="p-2 bg-background border rounded-md shadow-sm hover:bg-accent transition-colors"
          title="Zoom out"
        >
          <span className="sr-only">Zoom out</span>
          -
        </button>
        <button
          id="home-btn"
          className="p-2 bg-background border rounded-md shadow-sm hover:bg-accent transition-colors"
          title="Go home"
        >
          <span className="sr-only">Go home</span>
          ⌂
        </button>
        <button
          id="full-page-btn"
          className="p-2 bg-background border rounded-md shadow-sm hover:bg-accent transition-colors"
          title="Toggle full page"
        >
          <span className="sr-only">Toggle full page</span>
          ⛶
        </button>
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

export default OpenSeaDragonViewer;