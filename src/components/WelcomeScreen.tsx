import React from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FolderOpen } from 'lucide-react';
import { Button } from './ui/button';
import { Icons } from './Icons';
import { cn } from '../lib/utils';

interface WelcomeScreenProps {
  onOpenFile: () => void;
  onFileSelect: (files: File[]) => void;
  loading?: boolean;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onOpenFile, onFileSelect, loading = false }) => {
  const { getRootProps, isDragActive } = useDropzone({
    onDrop: onFileSelect,
    accept: {
      'application/octet-stream': ['.kfb']
    },
    multiple: false,
    noClick: true // Disable click to select, only allow drag/drop
  });
  return (
    <div
      className={cn(
        "flex items-center justify-center h-full bg-background transition-colors",
        isDragActive && "bg-primary/5"
      )}
    >
      <div className="text-center max-w-md mx-auto p-8">
        <div className="mb-8">
          <div className="w-24 h-24 mx-auto mb-4 flex items-center justify-center">
            <Icons.logo className="w-20 h-20 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-primary mb-2">
            KFB Inspector
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Open a KFB file to explore its structure, view associated images, and inspect tile data
          </p>
        </div>

        <div className="space-y-4">
          <Button
            onClick={onOpenFile}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2"
          >
            <FolderOpen className="w-4 h-4" />
            Open KFB File
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-6 transition-all",
              isDragActive
                ? "border-primary bg-primary/10 scale-105"
                : "border-border bg-muted/20"
            )}
            {...getRootProps()}
          >
            <Upload className={cn(
              "w-8 h-8 mx-auto mb-2 transition-colors",
              isDragActive ? "text-primary" : "text-muted-foreground"
            )} />
            <p className={cn(
              "text-sm transition-colors",
              isDragActive ? "text-primary font-medium" : "text-muted-foreground"
            )}>
              {isDragActive ? "Drop KFB file here" : "Drag and drop a KFB file here"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              (Drag/drop only - use buttons above to browse files)
            </p>
          </div>
        </div>

        <div className="mt-8 text-xs text-muted-foreground">
          <p>Supported format: .kfb files</p>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;