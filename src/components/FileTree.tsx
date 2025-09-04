import React, { useState, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, File, Image, Layers2, AlertCircle, Database, Search, Maximize2, Minimize2, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { KfbData, TreeNode } from '../types';
import { Button } from './ui/button';

interface FileTreeProps {
  data: KfbData | null;
  onNodeSelect: (node: TreeNode) => void;
}

const FileTree: React.FC<FileTreeProps> = ({ data, onNodeSelect }) => {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root', 'header', 'images', 'tiles']));
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSearch, setShowSearch] = useState<boolean>(false);

  // Format file sizes
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }, []);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <div className="text-center">
          <File className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No file loaded</p>
        </div>
      </div>
    );
  }

  const createTreeStructure = (): TreeNode[] => {
    const tilesByLevel: { [key: number]: any[] } = {};
    let totalTileSize = 0;
    data.tiles.forEach(tile => {
      if (!tilesByLevel[tile.zoom_level]) {
        tilesByLevel[tile.zoom_level] = [];
      }
      tilesByLevel[tile.zoom_level].push(tile);
      totalTileSize += tile.length;
    });

    // Calculate associated images total size
    const totalImageSize = data.associated_images.reduce((sum, img) => sum + (img.error ? 0 : img.length), 0);
    const validImages = data.associated_images.filter(img => !img.error);

    return [
      {
        id: 'root',
        label: `KFB File • ${formatFileSize(totalTileSize + totalImageSize)}`,
        type: 'root',
        data: data,
        children: [
          {
            id: 'header',
            label: 'Header & Metadata',
            type: 'folder',
            children: [
              {
                id: 'header-props',
                label: `Properties • ${data.header.base_width}×${data.header.base_height}`,
                type: 'header-props',
                data: data.header
              },
              {
                id: 'offsets',
                label: 'File Offsets',
                type: 'offsets',
                data: data.offsets
              }
            ]
          },
          {
            id: 'images',
            label: `Associated Images • ${validImages.length}/${data.associated_images.length} valid • ${formatFileSize(totalImageSize)}`,
            type: 'folder',
            children: data.associated_images.map(img => ({
              id: `image-${img.name}`,
              label: `${img.name.charAt(0).toUpperCase() + img.name.slice(1)} ${img.error ? '(Error)' : `• ${img.width}×${img.height} • ${formatFileSize(img.length)}`}`,
              type: img.error ? 'error' : 'associated-image',
              data: img
            }))
          },
          {
            id: 'tiles',
            label: `Tiles • ${data.tiles.length} total • ${Object.keys(tilesByLevel).length} levels • ${formatFileSize(totalTileSize)}`,
            type: 'folder',
            children: Object.entries(tilesByLevel)
              .sort(([a], [b]) => parseInt(a) - parseInt(b)) // Sort levels numerically
              .map(([level, tiles]) => {
                const levelSize = tiles.reduce((sum: number, tile: any) => sum + tile.length, 0);
                const avgSize = Math.round(levelSize / tiles.length);
                return {
                  id: `level-${level}`,
                  label: `Level ${level} • ${tiles.length} tiles • ${formatFileSize(levelSize)} • avg ${formatFileSize(avgSize)}`,
                  type: 'zoom-level',
                  data: { level: parseInt(level), tiles },
                  children: tiles.map((tile: any) => ({
                    id: `tile-${tile.index}`,
                    label: `Tile ${tile.index} • ${tile.tile_width}×${tile.tile_height} • ${formatFileSize(tile.length)}`,
                    type: 'tile',
                    data: tile
                  }))
                };
              })
          },
          {
            id: 'raw-data',
            label: 'Raw Data & Hex Viewer',
            type: 'raw-data',
            data: data
          }
        ]
      }
    ];
  };

  // Helper functions for tree operations (now that createTreeStructure is defined)
  const expandAll = useCallback(() => {
    if (!data) return;
    const allNodes = new Set<string>();
    const collectNodeIds = (node: TreeNode) => {
      allNodes.add(node.id);
      if (node.children) {
        node.children.forEach(collectNodeIds);
      }
    };
    createTreeStructure().forEach(collectNodeIds);
    setExpandedNodes(allNodes);
  }, [data, formatFileSize]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set(['root']));
  }, []);

  // Search functionality
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return createTreeStructure();

    const filterNodes = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.reduce<TreeNode[]>((acc, node) => {
        const matchesSearch = node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          node.type.toLowerCase().includes(searchQuery.toLowerCase());

        let filteredChildren: TreeNode[] = [];
        if (node.children) {
          filteredChildren = filterNodes(node.children);
        }

        // Include node if it matches or has matching children
        if (matchesSearch || filteredChildren.length > 0) {
          acc.push({
            ...node,
            children: filteredChildren.length > 0 ? filteredChildren : node.children
          });
        }

        return acc;
      }, []);
    };

    return filterNodes(createTreeStructure());
  }, [searchQuery, data, formatFileSize]);

  const toggleExpand = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const handleNodeClick = (node: TreeNode) => {
    if (node.children && node.children.length > 0) {
      toggleExpand(node.id);
    }

    setSelectedNode(node.id);
    onNodeSelect(node);
  };

  const getNodeIcon = (node: TreeNode) => {
    switch (node.type) {
      case 'root':
        return <File className="h-3.5 w-3.5" />;
      case 'folder':
        // Use FolderOpen for expanded folders, Folder for collapsed
        const isExpanded = expandedNodes.has(node.id);
        return isExpanded ? <FolderOpen className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />;
      case 'associated-image':
        return <Image className="h-3.5 w-3.5" />;
      case 'tile':
        return <Image className="h-3.5 w-3.5" />; // Changed from Layers to Image
      case 'zoom-level':
        return <Layers2 className="h-3.5 w-3.5" />; // Added zoom-level with Layers2
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'raw-data':
        return <Database className="h-3.5 w-3.5" />;
      default:
        return <File className="h-3.5 w-3.5" />;
    }
  };

  const renderNode = (node: TreeNode, level: number = 0): React.ReactElement => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNode === node.id;

    return (
      <div key={node.id} className={cn("ml-0", level > 0 && `ml-${level * 4}`)}>
        <div
          className={cn(
            "flex items-center gap-2 px-2 py-1 text-xs rounded-md cursor-pointer transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            isSelected && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
            node.type === 'error' && "text-destructive"
          )}
          onClick={() => handleNodeClick(node)}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
            )
          ) : (
            <div className="w-3.5 h-3.5 flex-shrink-0" />
          )}
          {getNodeIcon(node)}
          <span className="truncate">{node.label}</span>
        </div>
        {hasChildren && isExpanded && (
          <div className="ml-2">
            {node.children!.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Compact header with essential controls */}
      <div className="flex-shrink-0 px-2 py-1 bg-muted/10">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSearch(!showSearch)}
              className="h-6 w-6 p-0"
              title="Toggle search"
            >
              <Search className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={expandAll}
              className="h-6 w-6 p-0"
              title="Expand all"
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={collapseAll}
              className="h-6 w-6 p-0"
              title="Collapse all"
            >
              <Minimize2 className="h-3 w-3" />
            </Button>
          </div>

          {data && (
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 bg-muted rounded text-xs font-medium">
                {data.tiles.length} tiles
              </span>
              <span className="px-1.5 py-0.5 bg-muted rounded text-xs font-medium">
                {data.associated_images.filter(img => !img.error).length} images
              </span>
            </div>
          )}
        </div>

        {/* Search input */}
        {showSearch && (
          <div className="relative">
            <input
              type="text"
              placeholder="Search tiles, images, properties..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="w-full h-7 text-xs pr-8 px-3 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchQuery('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto p-2">
        {searchQuery && filteredTree.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <div className="text-center">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No results found</p>
              <p className="text-xs">Try a different search term</p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {(searchQuery ? filteredTree : filteredTree).map(node => renderNode(node))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileTree;