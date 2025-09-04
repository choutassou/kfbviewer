import { useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';
import { appWindow } from '@tauri-apps/api/window';
import { FileText, Loader2 } from 'lucide-react';
import { Button } from './components/ui/button';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './components/ui/resizable';
import FileTree from './components/FileTree';
import ContentViewer from './components/ContentViewer';
import WelcomeScreen from './components/WelcomeScreen';
import { KfbData, TreeNode } from './types';

function App() {
  const [kfbData, setKfbData] = useState<KfbData | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isSampleFile, setIsSampleFile] = useState(false);

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
    console.log('LoadFile started for:', filePath);
    setLoading(true);
    setError(null);

    try {
      // Validate file
      console.log('About to validate file...');
      await invoke<boolean>('open_kfb_file', { filePath });
      console.log('File validation completed');

      // Parse file
      console.log('About to parse file...');
      const data = await invoke<KfbData>('parse_kfb_file', { filePath });
      console.log('File parsing completed:', data);

      setKfbData(data);
      setCurrentFilePath(filePath);
      const newFileName = filePath.split('/').pop() || filePath.split('\\').pop() || '';

      // Update window title with file name
      if (isSampleFile) {
        await appWindow.setTitle(`KFB Inspector - ${newFileName} (Sample)`);
      } else {
        await appWindow.setTitle(`KFB Inspector - ${newFileName}`);
      }

      setSelectedNode(null);
    } catch (err) {
      setError(`Failed to load file: ${err}`);
    }

    setLoading(false);
  };

  const handleNodeSelect = (node: TreeNode) => {
    setSelectedNode(node);
  };

  const debugHeader = async () => {
    if (currentFilePath) {
      try {
        const headerHex = await invoke<string>('debug_file_header', { filePath: currentFilePath });
        console.log('KFB File Header (first 128 bytes):');
        console.log(headerHex);
      } catch (err) {
        console.error('Failed to debug header:', err);
      }
    }
  };

  const openSampleFile = async () => {
    try {
      setError(null);
      const samplePath = await invoke<string>('get_sample_file_path');
      setIsSampleFile(true);
      await loadFile(samplePath);
    } catch (err) {
      setError(`Failed to open sample file: ${err}`);
    }
  };


  // File selection from dropzone (drag/drop only)
  const handleFileSelect = async (files: File[]) => {
    const kfbFile = files.find(file => file.name.toLowerCase().endsWith('.kfb'));

    if (kfbFile) {
      // For Tauri, we need the file path, which only exists for drag/drop from filesystem
      const filePath = (kfbFile as any).path;
      if (filePath) {
        setIsSampleFile(false);
        await loadFile(filePath);
      } else {
        setError('File selection not supported. Please drag files from your file system or use the "Open KFB File" button.');
      }
    }
  };


  return (
    <div className="h-screen bg-background text-foreground">
      <main className="h-full overflow-hidden">
        {!kfbData ? (
          <WelcomeScreen onOpenFile={openFile} onOpenSample={openSampleFile} onFileSelect={handleFileSelect} loading={loading} />
        ) : (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
              <div className="flex h-full flex-col border-r bg-card">
                <div className="h-9 border-b bg-muted/50 px-3 py-1 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">File Structure</h3>
                  <div className="flex gap-1">
                    <Button onClick={openFile} disabled={loading} size="sm" className="flex items-center gap-1 h-7">
                      <FileText className="h-3 w-3" />
                      Open KFB
                    </Button>
                    <Button onClick={debugHeader} disabled={loading} size="sm" variant="outline" className="h-7 px-2">
                      Debug
                    </Button>
                  </div>
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
        )}
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