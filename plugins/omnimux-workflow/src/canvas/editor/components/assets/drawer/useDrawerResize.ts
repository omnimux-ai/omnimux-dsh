import React, { useState, useCallback } from 'react';

export interface UseDrawerResizeOptions {
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

export interface UseDrawerResizeReturn {
  drawerWidth: number;
  isResizing: boolean;
  startResize: (e: React.MouseEvent) => void;
  setDrawerWidth: React.Dispatch<React.SetStateAction<number>>;
}

export function useDrawerResize(options: UseDrawerResizeOptions = {}): UseDrawerResizeReturn {
  const { initialWidth = 320, minWidth = 260, maxWidth = 500 } = options;
  const [drawerWidth, setDrawerWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = drawerWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, startWidth - (moveEvent.clientX - startX)));
      setDrawerWidth(clampedWidth);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [drawerWidth, minWidth, maxWidth]);

  return { drawerWidth, isResizing, startResize, setDrawerWidth };
}
