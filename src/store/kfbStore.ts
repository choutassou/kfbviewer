import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { KfbData, TreeNode } from '../types';

interface KfbStore {
  // File state
  kfbData: KfbData | null;
  currentFilePath: string | null;
  isSampleFile: boolean;
  
  // UI state
  selectedNode: TreeNode | null;
  activeTab: 'structure' | 'viewer';
  
  // Actions
  setKfbData: (data: KfbData | null) => void;
  setCurrentFilePath: (path: string | null) => void;
  setIsSampleFile: (isSample: boolean) => void;
  setSelectedNode: (node: TreeNode | null) => void;
  setActiveTab: (tab: 'structure' | 'viewer') => void;
  clearFile: () => void;
}

export const useKfbStore = create<KfbStore>()(
  persist(
    (set) => ({
      // Initial state
      kfbData: null,
      currentFilePath: null,
      isSampleFile: false,
      selectedNode: null,
      activeTab: 'structure',

      // Actions
      setKfbData: (data) => set({ kfbData: data }),
      setCurrentFilePath: (path) => set({ currentFilePath: path }),
      setIsSampleFile: (isSample) => set({ isSampleFile: isSample }),
      setSelectedNode: (node) => set({ selectedNode: node }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      clearFile: () => set({
        kfbData: null,
        currentFilePath: null,
        isSampleFile: false,
        selectedNode: null,
        activeTab: 'structure'
      }),
    }),
    {
      name: 'kfb-inspector-storage',
      // Only persist specific fields, not the entire state
      partialize: (state) => ({
        currentFilePath: state.currentFilePath,
        isSampleFile: state.isSampleFile,
        activeTab: state.activeTab,
        // Don't persist kfbData or selectedNode as they can be large and stale
      }),
    }
  )
);