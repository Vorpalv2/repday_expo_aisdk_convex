import React from 'react';
import { ConvexBackendProvider, isConvexBackendConfigured } from './convex/ConvexBackendProvider';

export { useBackendAuth } from './convex/ConvexBackendProvider';
export { ConvexSetup as BackendSetup } from './convex/ConvexSetup';

export const isBackendConfigured = isConvexBackendConfigured;

export function BackendProvider({ children }: React.PropsWithChildren) {
  return <ConvexBackendProvider>{children}</ConvexBackendProvider>;
}
