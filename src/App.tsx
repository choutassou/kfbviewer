import React, { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';
import { appWindow } from '@tauri-apps/api/window';
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

  // Resizer state (for potential future custom resizing)
  const [isResizing, setIsResizing] = useState(false);

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
      // Set default window title
      await appWindow.setTitle('KFB Inspector');
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
      const newFileName = filePath.split('/').pop() || filePath.split('\\').pop() || '';
      setFileName(newFileName);

      // Update window title with file name
      const titlePrefix = isSampleFile ? 'Sample: ' : '';
      await appWindow.setTitle(`${titlePrefix}${newFileName} - KFB Inspector`);

      setSelectedNode(null);
    } catch (err) {
      setError(`Failed to load file: ${err}`);
    }

    setLoading(false);
  };

  const handleNodeSelect = (node: TreeNode) => {
    setSelectedNode(node);
  };


  // Drag and drop
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();

    const files = Array.from(e.dataTransfer.files);
    const kfbFile = files.find(file => file.name.toLowerCase().endsWith('.kfb'));

    if (kfbFile) {
      await loadFile((kfbFile as any).path);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="h-screen bg-background text-foreground" onDrop={handleDrop} onDragOver={handleDragOver}>
      <main className="h-full overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
            <div className="flex h-full flex-col border-r bg-card">
              <div className="h-9 border-b bg-muted/50 px-3 py-1 flex items-center justify-between">
                <h3 className="text-sm font-semibold">File Structure</h3>
                <Button onClick={openFile} disabled={loading} size="sm" className="flex items-center gap-1 h-7">
                  <FileText className="h-3 w-3" />
                  Open KFB
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <FileTree data={kfbData} onNodeSelect={handleNodeSelect} />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={75}>
            <div className="flex h-full flex-col bg-background">
              <div className="border-b bg-muted/50 px-3 py-2">
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