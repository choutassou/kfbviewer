import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, File, Image, Layers, AlertCircle, Database } from 'lucide-react';
import { cn } from '../lib/utils';
import { KfbData, TreeNode } from '../types';

interface FileTreeProps {
  data: KfbData | null;
  onNodeSelect: (node: TreeNode) => void;
}

const FileTree: React.FC<FileTreeProps> = ({ data, onNodeSelect }) => {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root', 'header', 'images', 'tiles']));

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
    data.tiles.forEach(tile => {
      if (!tilesByLevel[tile.zoom_level]) {
        tilesByLevel[tile.zoom_level] = [];
      }
      tilesByLevel[tile.zoom_level].push(tile);
    });

    return [
      {
        id: 'root',
        label: 'KFB File',
        type: 'root',
        data: data,
        children: [
          {
            id: 'header',
            label: 'Header',
            type: 'folder',
            children: [
              {
                id: 'header-props',
                label: 'Properties',
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
            label: 'Associated Images',
            type: 'folder',
            children: data.associated_images.map(img => ({
              id: `image-${img.name}`,
              label: `${img.name.charAt(0).toUpperCase() + img.name.slice(1)} ${img.error ? '(Error)' : `(${img.width}×${img.height})`}`,
              type: img.error ? 'error' : 'associated-image',
              data: img
            }))
          },
          {
            id: 'tiles',
            label: `Tiles (${data.tiles.length})`,
            type: 'folder',
            children: Object.entries(tilesByLevel).map(([level, tiles]) => ({
              id: `level-${level}`,
              label: `Level ${level} (${tiles.length} tiles)`,
              type: 'zoom-level',
              data: { level: parseInt(level), tiles },
              children: tiles.map((tile: any) => ({
                id: `tile-${tile.index}`,
                label: `Tile ${tile.index} (${tile.tile_width}×${tile.tile_height})`,
                type: 'tile',
                data: tile
              }))
            }))
          },
          {
            id: 'raw-data',
            label: 'Raw Data',
            type: 'raw-data',
            data: data
          }
        ]
      }
    ];
  };

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
        return <File className="h-4 w-4" />;
      case 'folder':
        return <Folder className="h-4 w-4" />;
      case 'associated-image':
        return <Image className="h-4 w-4" />;
      case 'tile':
        return <Layers className="h-4 w-4" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'raw-data':
        return <Database className="h-4 w-4" />;
      default:
        return <File className="h-4 w-4" />;
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
            "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            isSelected && "bg-primary text-primary-foreground hover:bg-primary/90",
            node.type === 'error' && "text-destructive"
          )}
          onClick={() => handleNodeClick(node)}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 flex-shrink-0" />
            )
          ) : (
            <div className="w-4 h-4 flex-shrink-0" />
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

  const treeNodes = createTreeStructure();

  return (
    <div className="space-y-1">
      {treeNodes.map(node => renderNode(node))}
    </div>
  );
};

export default FileTree;