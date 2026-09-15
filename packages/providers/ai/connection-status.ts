import type { AIProviderErrorKind, ModelDiscovery } from './contracts';

/** Product-facing connection states; the wire Provider contract is unchanged. */
export type AIConnectionStatus =
  | 'connected'
  | 'authentication_failed'
  | 'endpoint_invalid'
  | 'model_unavailable'
  | 'timeout'
  | 'rate_limited'
  | 'provider_error'
  | 'not_configured';

export const connectionStatusForError = (
  kind: AIProviderErrorKind,
): Exclude<AIConnectionStatus, 'connected' | 'model_unavailable' | 'not_configured'> => {
  switch (kind) {
    case 'unauthorized':
      return 'authentication_failed';
    case 'endpoint_not_found':
    case 'invalid_configuration':
      return 'endpoint_invalid';
    case 'timeout':
      return 'timeout';
    case 'rate_limited':
      return 'rate_limited';
    case 'disabled':
    case 'privacy_boundary':
    case 'malformed_response':
    case 'upstream_error':
      return 'provider_error';
  }
};

export const connectionStatusForDiscovery = (
  model: string,
  discovery: ModelDiscovery,
): AIConnectionStatus => {
  const selected = model.trim();
  if (selected.length === 0) return 'model_unavailable';
  if (!discovery.modelDiscoverySupported) return 'connected';
  return discovery.models.some((item) => item.id === selected)
    ? 'connected'
    : 'model_unavailable';
};
