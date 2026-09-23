import React from 'react';
import { VideoLinkPopover, type VideoLinkPopoverProps } from './VideoLinkPopover.tsx';

export type ProductUrlPopoverProps = Omit<VideoLinkPopoverProps, 'kind'> & {
  t?: (key: string, vars?: any) => string;
};

export const ProductUrlPopover: React.FC<ProductUrlPopoverProps> = props => (
  <VideoLinkPopover {...props} kind="product" />
);
