export default function useIncomingShare() {
  return {
    sharedPayloads: [],
    resolvedSharedPayloads: [],
    clearSharedPayloads: () => {},
    isResolving: false,
    error: null,
    refreshSharePayloads: () => {},
  };
}
