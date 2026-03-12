declare module "@vykeai/fed" {
  export interface Peer {
    machine: string;
    [key: string]: unknown;
  }
  export function registerTool(opts: unknown): Promise<() => void>;
  export function discoverTools(
    identity: unknown,
    onAdd: (peer: Peer) => void,
    onRemove: (name: string) => void,
  ): () => void;
}
