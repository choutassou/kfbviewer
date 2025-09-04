import React, { useEffect, useRef, useState } from 'react';
import OpenSeadragon from 'openseadragon';
import { invoke } from '@tauri-apps/api/tauri';
import { Plus, Minus, Home } from 'lucide-react';
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
  const [_zoom, setZoom] = useState<number>(0);
  const [currentLevel, setCurrentLevel] = useState<number>(0);
  const [currentKfbLevel, setCurrentKfbLevel] = useState<number | null>(null);
  const [homeZoom, setHomeZoom] = useState<number>(1);
  // no full-page toggle in current UI
  const [viewerReady, setViewerReady] = useState<boolean>(false);

  // Compute a robust zoom ratio using viewport bounds
  const calcZoomRatio = (v?: OpenSeadragon.Viewport | null): number => {
    if (!v) return 0;
    try {
      const bounds = v.getBounds(true);
      const w = bounds?.width ?? 0;
      if (!w || !isFinite(w)) return 0;
      return 1 / w; // smaller width => higher zoom
    } catch {
      return 0;
    }
  };

  // Prefer using OSD's current zoom relative to home zoom; fallback to bounds
  const calcZoomDisplay = (v?: OpenSeadragon.Viewport | null): number => {
    if (!v) return 0;
    try {
      const hz = v.getHomeZoom();
      const z = v.getZoom();
      if (hz && isFinite(hz) && hz > 0 && isFinite(z)) {
        return z / hz;
      }
    } catch { }
    return calcZoomRatio(v);
  };

  const refreshZoom = () => {
    try {
      setZoom(calcZoomRatio(osdViewerRef.current?.viewport || null));
    } catch { }
  };

  // Map OSD level -> KFB level for indicator
  const osdToKfbRef = useRef<Map<number, number> | null>(null);

  useEffect(() => {
    if (!viewerRef.current) return;

    const initializeViewer = async () => {


      try {
        // Destroy existing viewer if it exists
        if (osdViewerRef.current) {
          osdViewerRef.current.destroy();
          osdViewerRef.current = null;
        }

        // Fallback: simple image when KFB data not present, so controls/zoom can be validated
        if (!kfbData || !filePath) {

          osdViewerRef.current = OpenSeadragon({
            element: viewerRef.current!,
            tileSources: {
              type: 'image',
              url:
                'data:image/svg+xml;utf8,' +
                encodeURIComponent(
                  `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000">
                    <defs>
                      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#e3f2fd"/>
                        <stop offset="100%" stop-color="#bbdefb"/>
                      </linearGradient>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#g)"/>
                    <g font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="48" fill="#0d47a1">
                      <text x="50" y="120">OpenSeadragon Fallback</text>
                      <text x="50" y="200">Controls + Zoom should work</text>
                    </g>
                  </svg>`
                ),
            },
            showNavigationControl: false,
            debugMode: false,
          });


          setViewerReady(true);

          // no debug styling

          const updateZoom = () => {
            try {
              const v = osdViewerRef.current?.viewport;
              if (v) {
                setZoom(calcZoomDisplay(v));
                setHomeZoom(v.getHomeZoom() || 1);
              }
            } catch { }
          };
          osdViewerRef.current.addHandler('open', () => { updateZoom(); });
          osdViewerRef.current.addHandler('zoom', updateZoom);
          osdViewerRef.current.addHandler('animation', updateZoom);
          return; // stop here in fallback mode
        }

        // Calculate KFB configuration
        const tiles = kfbData.tiles;
        const tileSize = tiles[0]?.tile_width || kfbData.header.tile_size || 256;

        // Group by level, compute per-level offsets/sizes, and sort levels by area (smallest -> largest)
        const tilesByLevel = new Map<number, typeof tiles>();
        const levelOffsets = new Map<number, { minX: number; minY: number }>();
        const levelSizes = new Map<number, { width: number; height: number }>();

        Array.from(new Set(tiles.map(t => t.zoom_level))).forEach(level => {
          const levelTiles = tiles.filter(t => t.zoom_level === level);
          tilesByLevel.set(level, levelTiles);
          if (levelTiles.length) {
            const minX = Math.min(...levelTiles.map(t => t.pos_x));
            const minY = Math.min(...levelTiles.map(t => t.pos_y));
            const maxX = Math.max(...levelTiles.map(t => t.pos_x)) + tileSize;
            const maxY = Math.max(...levelTiles.map(t => t.pos_y)) + tileSize;
            levelOffsets.set(level, { minX, minY });
            levelSizes.set(level, { width: maxX - minX, height: maxY - minY });
          }
        });

        const kfbLevels = Array.from(tilesByLevel.keys()).sort((a, b) => {
          const sa = levelSizes.get(a) || { width: 0, height: 0 };
          const sb = levelSizes.get(b) || { width: 0, height: 0 };
          return (sa.width * sa.height) - (sb.width * sb.height);
        });

        // Create mapping from OpenSeadragon level (0-based) to KFB level
        const osdToKfbLevel = new Map<number, number>();
        const kfbToOsdLevel = new Map<number, number>();
        kfbLevels.forEach((kfbLevel, index) => {
          osdToKfbLevel.set(index, kfbLevel);
          kfbToOsdLevel.set(kfbLevel, index);
        });
        osdToKfbRef.current = osdToKfbLevel;



        // Pre-compute tile existence map for fast lookups using per-level offsets
        const tileExistsMap = new Map<string, boolean>();
        const positionToTileMap = new Map<string, any>();
        tiles.forEach(tile => {
          if (!kfbLevels.includes(tile.zoom_level)) return;
          const osdLevel = kfbToOsdLevel.get(tile.zoom_level)!;
          const off = levelOffsets.get(tile.zoom_level) || { minX: 0, minY: 0 };
          const tileX = (tile.pos_x - off.minX) / tileSize;
          const tileY = (tile.pos_y - off.minY) / tileSize;
          if (tileX !== Math.floor(tileX) || tileY !== Math.floor(tileY)) {
            // non-integer coordinates; ignore warning in production
          }
          const key = `${osdLevel}-${Math.floor(tileX)}-${Math.floor(tileY)}`;
          tileExistsMap.set(key, true);
          positionToTileMap.set(key, tile);
        });



        // Pre-compute tile bounds for each OpenSeadragon level using per-level offsets
        const tileBoundsMap = new Map<number, { x: number, y: number }>();
        kfbLevels.forEach((kfbLevel, index) => {
          const osdLevel = index; // OpenSeadragon level
          const levelTiles = tilesByLevel.get(kfbLevel) || [];
          if (levelTiles.length > 0) {
            const off = levelOffsets.get(kfbLevel) || { minX: 0, minY: 0 };
            const maxTileX = Math.max(...levelTiles.map(t => (t.pos_x - off.minX) / tileSize));
            const maxTileY = Math.max(...levelTiles.map(t => (t.pos_y - off.minY) / tileSize));
            const tilesX = Math.max(1, Math.min(Math.floor(maxTileX) + 1, 500));
            const tilesY = Math.max(1, Math.min(Math.floor(maxTileY) + 1, 500));
            tileBoundsMap.set(osdLevel, { x: tilesX, y: tilesY });
          } else {
            tileBoundsMap.set(osdLevel, { x: 1, y: 1 });
          }
        });



        // Create KFB Custom TileSource using class extends (OSD modern API)
        class KFBTileSource extends (OpenSeadragon as any).TileSource {
          constructor(options: any) {
            super(options);
          }
          getTileUrl(level: number, x: number, y: number): string {
            return `kfb://${filePath}/${level}/${x}/${y}`;
          }
          tileExists(level: number, x: number, y: number): boolean {
            if (level < 0 || level >= kfbLevels.length) return false;
            const key = `${level}-${x}-${y}`;
            const exists = tileExistsMap.has(key);
            if (!exists) {

            }
            return exists;
          }
          getNumTiles(level: number): any {
            const bounds = tileBoundsMap.get(level) || { x: 1, y: 1 };

            return new (OpenSeadragon as any).Point(bounds.x, bounds.y);
          }
          // Provide a stable hash for OSD image cache
          getTileHashKey(level: number, x: number, y: number, _time?: number): string {
            return `${level}/${x}_${y}`;
          }
          downloadTileStart(imageJob: any): void {
            // Greedy path capture to include full file path with slashes
            const match = imageJob.src.match(/kfb:\/\/(.+)\/(\d+)\/(\d+)\/(\d+)/);
            if (!match) {
              imageJob.fail('Invalid URL', null);
              return;
            }
            const [, path, level, x, y] = match;
            const osdLevel = parseInt(level);
            const xInt = parseInt(x);
            const yInt = parseInt(y);

            const key = `${osdLevel}-${xInt}-${yInt}`;
            const tile = positionToTileMap.get(key);
            if (!tile) {

              imageJob.fail('Tile not found', null);
              return;
            }

            const image = new Image();
            imageJob.userData = { image };
            image.onload = function () {
              imageJob.finish(image, null, 'image');
            };
            image.onerror = function () {
              imageJob.fail('Image load failed', null);
            };
            invoke<string>('get_tile', {
              filePath: path,
              level: tile.zoom_level,
              x: tile.pos_x,
              y: tile.pos_y
            })
              .then(base64Data => {
                image.src = `data:image/jpeg;base64,${base64Data}`;
              })
              .catch(error => {
                imageJob.fail(`Backend error: ${error}`, null);
              });
          }
          downloadTileAbort(imageJob: any): void {
            if (imageJob.userData && imageJob.userData.image) {
              imageJob.userData.image.src = '';
            }
          }
        }

        // Calculate the actual content bounds from the largest level
        const largestKfbLevel = kfbLevels[kfbLevels.length - 1];
        const largestLevelTiles = tilesByLevel.get(largestKfbLevel) || [];
        const largestOff = levelOffsets.get(largestKfbLevel) || { minX: 0, minY: 0 };
        const maxPosX = Math.max(...largestLevelTiles.map(t => t.pos_x)) + tileSize;
        const maxPosY = Math.max(...largestLevelTiles.map(t => t.pos_y)) + tileSize;

        const actualWidth = maxPosX - largestOff.minX;
        const actualHeight = maxPosY - largestOff.minY;



        // Create the KFB tile source instance following OpenSeadragon patterns


        let kfbTileSource;
        try {
          kfbTileSource = new KFBTileSource({
            width: actualWidth,
            height: actualHeight,
            tileSize: tileSize,
            overlap: 0,
            minLevel: 0,
            maxLevel: kfbLevels.length - 1
          });

        } catch (error) {

          // Fallback viewer so controls/indicator still function
          try {
            osdViewerRef.current = OpenSeadragon({
              element: viewerRef.current!,
              tileSources: {
                type: 'image',
                url:
                  'data:image/svg+xml;utf8,' +
                  encodeURIComponent(
                    `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1600\" height=\"1000\">\n                      <rect width=\"100%\" height=\"100%\" fill=\"#e3f2fd\"/>\n                      <g font-family=\"system-ui, -apple-system, Segoe UI, Roboto, sans-serif\" font-size=\"48\" fill=\"#0d47a1\">\n                        <text x=\"50\" y=\"160\">Fallback viewer (TileSource error)</text>\n                      </g>\n                    </svg>`
                  ),
              },
              showNavigationControl: false,
              debugMode: false,
            });
            setViewerReady(true);
          } catch (e) { }
          return;
        }



        osdViewerRef.current = OpenSeadragon({
          element: viewerRef.current!,
          tileSources: kfbTileSource,
          // Disable all UI overlays for performance
          showNavigationControl: false,
          showZoomControl: false,
          showHomeControl: false,
          showFullPageControl: false,
          showRotationControl: false,
          showSequenceControl: false,
          showReferenceStrip: false,
          showNavigator: false,
          debugMode: false,
        });


        setViewerReady(true);

        // Apply a bright debug background/border to OSD container immediately
        try {
          // no debug styling here
        } catch (_) { }

        // Add basic event listeners
        osdViewerRef.current.addHandler('open', () => {

          // Initialize zoom metrics
          try {
            const v = osdViewerRef.current?.viewport;
            if (v) {
              setZoom(calcZoomDisplay(v));
              const hz = v.getHomeZoom();
              setHomeZoom(hz || 1);
            }
          } catch (e) { }

          // Debug: inspect what OpenSeadragon created


          if (viewerRef.current) {
            const children = Array.from(viewerRef.current.children);
            children.forEach((child) => {
              const element = child as HTMLElement;

              // Force the OpenSeadragon container to have proper height
              if (element.className === 'openseadragon-container') {

                element.style.height = '100%';
                element.style.minHeight = '600px';
                element.style.width = '100%';
                element.style.display = 'block';


              }
            });
          }

          // Remove the red text overlay once OpenSeadragon opens
          const overlay = document.getElementById('osd-test-overlay');
          if (overlay) {
            overlay.style.display = 'none';
          }
        });

        osdViewerRef.current.addHandler('open-failed', (_event: any) => { });

        osdViewerRef.current.addHandler('tile-loaded', (event: any) => {
          try {
            const osdLevel = event?.tile?.level;
            if (typeof osdLevel === 'number') {
              setCurrentLevel(osdLevel);
              const map = osdToKfbRef.current;
              setCurrentKfbLevel(map ? (map.get(osdLevel) ?? null) : null);
            }
          } catch { }
        });

        // Keep zoom indicator updated during interactions
        const updateZoom = () => {
          try {
            const v = osdViewerRef.current?.viewport;
            if (v) {
              setZoom(calcZoomDisplay(v));
              if (!homeZoom) {
                setHomeZoom(v.getHomeZoom() || 1);
              }
            }
          } catch { }
        };
        osdViewerRef.current.addHandler('zoom', updateZoom);
        osdViewerRef.current.addHandler('animation', updateZoom);

      } catch (error) {

        try {
          // Last-resort fallback
          osdViewerRef.current = OpenSeadragon({
            element: viewerRef.current!,
            tileSources: {
              type: 'image',
              url:
                'data:image/svg+xml;utf8,' +
                encodeURIComponent(
                  `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1600\" height=\"1000\">\n                    <rect width=\"100%\" height=\"100%\" fill=\"#ffebee\"/>\n                    <g font-family=\"system-ui, -apple-system, Segoe UI, Roboto, sans-serif\" font-size=\"48\" fill=\"#b71c1c\">\n                      <text x=\"50\" y=\"160\">OSD init failed; using fallback</text>\n                    </g>\n                  </svg>`
                ),
            },
            showNavigationControl: false,
            debugMode: false,
          });
          setViewerReady(true);
        } catch (e) {

        }
      }
    };

    initializeViewer();

    // Cleanup function
    return () => {
      if (osdViewerRef.current) {
        osdViewerRef.current.destroy();
        osdViewerRef.current = null;
      }
      setViewerReady(false);
    };
  }, [kfbData, filePath]); // Reinitialize when KFB data or file path changes

  return (
    <div className="relative w-full h-full">
      {/* Custom control buttons */}
      <div className="absolute top-4 left-4 z-50 flex flex-col gap-2">
        <Button
          id="zoom-in-btn"
          variant="outline"
          size="icon"
          title="Zoom in"
          disabled={!viewerReady}
          onClick={() => {
            const v = osdViewerRef.current?.viewport;
            if (v) {

              v.zoomBy(1.2, v.getCenter(), true);
              v.applyConstraints();
              refreshZoom();
            }
          }}
        >
          <Plus className="w-4 h-4 mx-auto" />
        </Button>
        <Button
          id="zoom-out-btn"
          variant="outline"
          size="icon"
          title="Zoom out"
          disabled={!viewerReady}
          onClick={() => {
            const v = osdViewerRef.current?.viewport;
            if (v) {

              v.zoomBy(1 / 1.2, v.getCenter(), true);
              v.applyConstraints();
              refreshZoom();
            }
          }}
        >
          <Minus className="w-4 h-4 mx-auto" />
        </Button>
        <Button
          id="home-btn"
          variant="outline"
          size="icon"
          title="Go home"
          disabled={!viewerReady}
          onClick={() => {
            const v = osdViewerRef.current?.viewport;
            if (v) {

              v.goHome(true);
              // update after animation settles
              setTimeout(refreshZoom, 50);
            }
          }}
        >
          <Home className="w-4 h-4 mx-auto" />
        </Button>
      </div>

      {/* Level indicator */}
      <div className="absolute top-4 right-4 z-50">
        <div className="px-2 py-1 rounded bg-black/60 text-white text-xs shadow">
          {currentKfbLevel !== null
            ? `Level: ${currentLevel} (KFB ${currentKfbLevel})`
            : `Level: ${currentLevel}`}
        </div>
      </div>

      {/* OpenSeadragon container */}
      <div
        ref={viewerRef}
        style={{
          width,
          height,
          position: 'relative',
          overflow: 'hidden',
          minHeight: '600px',
        }}
        className="w-full h-full bg-background"
      >
      </div>
    </div>
  );
};

export default SlideViewer;
