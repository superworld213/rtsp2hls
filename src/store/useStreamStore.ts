import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Stream, StreamStatus, AppSettings, DEFAULT_SETTINGS } from '../types/stream';

interface StreamStore {
  // 流配置
  streams: Stream[];
  streamStatuses: Record<string, StreamStatus>;
  
  // 应用设置
  settings: AppSettings;
  
  // 流配置操作
  addStream: (stream: Omit<Stream, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => void;
  updateStream: (id: string, updates: Partial<Stream>) => void;
  deleteStream: (id: string) => void;
  getStream: (id: string) => Stream | undefined;
  
  // 流状态操作
  updateStreamStatus: (id: string, status: Partial<StreamStatus>) => void;
  getStreamStatus: (id: string) => StreamStatus | undefined;
  
  // 设置操作
  updateSettings: (updates: Partial<AppSettings>) => void;
  resetSettings: () => void;
  
  // 工具方法
  getRunningStreams: () => Stream[];
  getStreamCount: () => number;
}

export const useStreamStore = create<StreamStore>()(
  persist(
    (set, get) => ({
      streams: [],
      streamStatuses: {},
      settings: DEFAULT_SETTINGS,
      
      addStream: (streamData: Omit<Stream, 'id' | 'createdAt' | 'updatedAt'>) => {
        const newStream: Stream = {
          ...streamData,
          id: `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          status: 'stopped',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        set((state) => ({
          streams: [...state.streams, newStream],
          streamStatuses: {
            ...state.streamStatuses,
            [newStream.id]: {
              id: newStream.id,
              status: 'stopped'
            }
          }
        }));
      },
      
      updateStream: (id: string, updates: Partial<Stream>) => {
        set((state) => ({
          streams: state.streams.map(stream => 
            stream.id === id 
              ? { ...stream, ...updates, updatedAt: new Date() }
              : stream
          )
        }));
      },
      
      deleteStream: (id) => {
        set((state) => {
          const {...remainingStatuses } = state.streamStatuses;
          return {
            streams: state.streams.filter(stream => stream.id !== id),
            streamStatuses: remainingStatuses
          };
        });
      },
      
      getStream: (id) => {
        return get().streams.find(stream => stream.id === id);
      },
      
      updateStreamStatus: (id, statusUpdate) => {
        set((state) => ({
          streamStatuses: {
            ...state.streamStatuses,
            [id]: {
              ...state.streamStatuses[id],
              ...statusUpdate,
              id
            }
          }
        }));
        
        // 同时更新stream的status字段
        if (statusUpdate.status) {
          get().updateStream(id, { status: statusUpdate.status });
        }
      },
      
      getStreamStatus: (id) => {
        return get().streamStatuses[id];
      },
      
      updateSettings: (updates) => {
        set((state) => ({
          settings: { ...state.settings, ...updates }
        }));
      },
      
      resetSettings: () => {
        set({ settings: DEFAULT_SETTINGS });
      },
      
      getRunningStreams: () => {
        const { streams, streamStatuses } = get();
        return streams.filter(stream => {
          const status = streamStatuses[stream.id];
          return status && (status.status === 'running' || status.status === 'starting');
        });
      },
      
      getStreamCount: () => {
        return get().streams.length;
      }
    }),
    {
      name: 'rtsp2hls-storage',
      partialize: (state) => ({
        streams: state.streams,
        settings: state.settings
        // 不持久化streamStatuses，因为它们是运行时状态
      })
    }
  )
);