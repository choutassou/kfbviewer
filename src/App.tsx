import React, { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';
import { FileText, Loader2 } from 'lucide-react';
import { Button } from './components/ui/button';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './components/ui/resizable';
import FileTree from './components/FileTree';
import ContentViewer from './components/ContentViewer';
import { KfbData, TreeNode } from './types';

function App() {
  const [kfbData, setKfbData] = useState<KfbData | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  
  // Resizer state
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);
  
  // Auto-load sample file on startup
  const [isSampleFile, setIsSampleFile] = useState(false);
  
  useEffect(() => {
    loadSampleFileOnStartup();
  }, []);
  
  const loadSampleFileOnStartup = async () => {
    try {
      const samplePath = await invoke<string>('get_sample_file_path');
      setIsSampleFile(true);
      await loadFile(samplePath);
    } catch (err) {
      console.log('Sample file not found or failed to load:', err);
      setIsSampleFile(false);
    }
  };

  const openFile = async () => {
    try {
      setError(null);
      const selected = await open({
        filters: [
          {
            name: 'KFB Files',
            extensions: ['kfb']
          }
        ]
      });

      if (selected && typeof selected === 'string') {
        setIsSampleFile(false);
        await loadFile(selected);
      }
    } catch (err) {
      setError(`Failed to open file: ${err}`);
    }
  };

  const loadFile = async (filePath: string) => {
    setLoading(true);
    setError(null);
    
    try {
      // Validate file
      await invoke<boolean>('open_kfb_file', { filePath });
      
      // Parse file
      const data = await invoke<KfbData>('parse_kfb_file', { filePath });
      
      setKfbData(data);
      setCurrentFilePath(filePath);
      setFileName(filePath.split('/').pop() || filePath.split('\\').pop() || '');
      setSelectedNode(null);
    } catch (err) {
      setError(`Failed to load file: ${err}`);
    }
    
    setLoading(false);
  };

  const handleNodeSelect = (node: TreeNode) => {
    setSelectedNode(node);
  };

  // Resizer logic
  const startResizing = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  const stopResizing = () => {
    setIsResizing(false);
  };

  const resize = (e: MouseEvent) => {
    if (isResizing) {
      const newWidth = Math.max(200, Math.min(600, e.clientX));
      setSidebarWidth(newWidth);
    }
  };

  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', resize);
      document.addEventListener('mouseup', stopResizing);
    }

    return () => {
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing]);

  // Drag and drop
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    
    const files = Array.from(e.dataTransfer.files);
    const kfbFile = files.find(file => file.name.toLowerCase().endsWith('.kfb'));
    
    if (kfbFile) {
      await loadFile(kfbFile.path);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="h-screen bg-background text-foreground" onDrop={handleDrop} onDragOver={handleDragOver}>
      <header className="flex items-center gap-4 border-b bg-card px-4 py-3 shadow-sm">
        <Button onClick={openFile} disabled={loading} className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Open KFB File
        </Button>
        {fileName && (
          <span className="text-sm text-muted-foreground font-mono">
            {isSampleFile && <span className="text-blue-600 font-semibold">Sample: </span>}
            {fileName}
          </span>
        )}
      </header>

      <main className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
            <div className="flex h-full flex-col border-r bg-card">
              <div className="border-b bg-muted/50 px-4 py-3">
                <h3 className="text-sm font-semibold">File Structure</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <FileTree data={kfbData} onNodeSelect={handleNodeSelect} />
              </div>
            </div>
          </ResizablePanel>
          
          <ResizableHandle direction="horizontal" />
          
          <ResizablePanel defaultSize={75}>
            <div className="flex h-full flex-col bg-background">
              <div className="border-b bg-muted/50 px-4 py-3">
                <h3 className="text-sm font-semibold">{selectedNode ? selectedNode.label : 'Content'}</h3>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ContentViewer node={selectedNode} filePath={currentFilePath} />
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>

      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-lg bg-card p-6 shadow-lg">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading file...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed right-4 top-4 z-50 max-w-md rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">{error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              className="h-6 w-6 p-0 text-destructive hover:bg-destructive/20"
            >
              ×
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;