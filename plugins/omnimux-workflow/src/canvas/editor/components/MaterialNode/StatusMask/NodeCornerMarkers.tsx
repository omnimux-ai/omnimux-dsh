/**
 * NodeCornerMarkers — 节点选中时的四角缩放/定位标记点组件
 */

import React from 'react';

export interface NodeCornerMarkersProps {
  selected: boolean;
}

export const NodeCornerMarkers: React.FC<NodeCornerMarkersProps> = ({ selected }) => {
  if (!selected) return null;
  return (
    <>
      <span className="wf-node-corner wf-node-corner--tl" />
      <span className="wf-node-corner wf-node-corner--tr" />
      <span className="wf-node-corner wf-node-corner--bl" />
      <span className="wf-node-corner wf-node-corner--br" />
    </>
  );
};
