import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';
import { appWindow } from '@tauri-apps/api/window';
import { FileText, Loader2, ZoomIn, FolderTree } from 'lucide-react';
import { Button } from './components/ui/button';
import { Icons } from './components/Icons';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './components/ui/resizable';
import FileTree from './components/FileTree';
import ContentViewer from './components/ContentViewer';
import WelcomeScreen from './components/WelcomeScreen';
import SlideViewer from './components/SlideViewer';
import { useKfbStore } from './store/kfbStore';
import { KfbData, TreeNode } from './types';

function App() {
  // Use Zustand store for persistent state
  const {
    kfbData,
    currentFilePath,
    isSampleFile,
    selectedNode,
    activeTab,
    setKfbData,
    setCurrentFilePath,
    setIsSampleFile,
    setSelectedNode,
    setActiveTab,
  } = useKfbStore();

  // Local loading and error state (don't persist these)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore file on app load if we have a persisted file path
  useEffect(() => {
    const restoreFile = async () => {
      if (currentFilePath && !kfbData) {
        console.log('Restoring file from persisted path:', currentFilePath);
        try {
          await loadFile(currentFilePath);
        } catch (err) {
          console.error('Failed to restore file:', err);
          setError(`Failed to restore file: ${err}`);
          // Clear the persisted path if it's no longer valid
          setCurrentFilePath(null);
          setIsSampleFile(false);
        }
      }
    };

    restoreFile();
  }, []); // Only run once on mount

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
          <WelcomeScreen onOpenFile={openFile} onFileSelect={handleFileSelect} loading={loading} />
        ) : (
          <div className="h-full flex flex-col">
            {/* Header with tabs */}
            <div className="flex-shrink-0 border-b bg-muted/50 px-3 py-1.5 gap-2 flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7"
                onClick={async () => {
                  setKfbData(null);
                  await appWindow.setTitle('KFB Inspector');
                }}
                title="Return to welcome screen"
              >
                <Icons.logo className="w-5 h-5 text-primary" />
              </Button>
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'structure' | 'viewer')}>
                <TabsList className="h-8 bg-muted/50">
                  <TabsTrigger value="structure" className="h-7 flex items-center gap-1.5 text-sm">
                    <FolderTree className="h-4 w-4" />
                    Inspector
                  </TabsTrigger>
                  <TabsTrigger value="viewer" className="h-7 flex items-center gap-1.5 text-sm">
                    <ZoomIn className="h-4 w-4" />
                    Deep Zoom
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Button
                onClick={openFile}
                disabled={loading}
                size="sm"
                variant={'outline'}
                className="ml-auto flex items-center gap-1 h-7 text-sm"
              >
                <FileText className="h-3 w-3" />
                Load File
              </Button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'structure' ? (
                <ResizablePanelGroup direction="horizontal" className="h-full">
                  <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
                    <div className="flex h-full flex-col border-r bg-card">
                      <div className="flex-1 overflow-y-auto">
                        <FileTree data={kfbData} onNodeSelect={handleNodeSelect} />
                      </div>
                    </div>
                  </ResizablePanel>

                  <ResizableHandle withHandle />

                  <ResizablePanel defaultSize={75}>
                    <div className="flex h-full flex-col bg-background">
                      <div className="flex-1 overflow-y-auto">
                        <ContentViewer node={selectedNode} filePath={currentFilePath} onNodeSelect={handleNodeSelect} />
                      </div>
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              ) : (
                <div className="h-full">
                  <SlideViewer
                    filePath={currentFilePath}
                    height="100%"
                  />
                </div>
              )}
            </div>
          </div>
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