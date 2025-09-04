export interface KfbHeader {
  magic: string;
  tile_count: number;
  base_width: number;
  base_height: number;
  zoom_levels: number;
  scan_scale: number;
  compression: string;
  spend_time: number;
  scan_time: number;
  image_cap_res: number;
  tile_size: number;
}

export interface KfbOffsets {
  macro_info_offset: number;
  label_info_offset: number;
  preview_info_offset: number;
  tiles_info_offset: number;
}

export interface AssociatedImage {
  name: string;
  width: number;
  height: number;
  length: number;
  data_offset: number;
  offset: number;
  error?: string;
}

export interface KfbTile {
  index: number;
  pos_x: number;
  pos_y: number;
  tile_width: number;
  tile_height: number;
  id: number;
  zoom_level: number;
  length: number;
  data_offset: number;
}

export interface KfbData {
  header: KfbHeader;
  offsets: KfbOffsets;
  associated_images: AssociatedImage[];
  tiles: KfbTile[];
}

export interface TreeNode {
  id: string;
  label: string;
  type: string;
  data?: any;
  children?: TreeNode[];
  expanded?: boolean;
}