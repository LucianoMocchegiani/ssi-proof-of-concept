declare module 'ed2curve' {
  export function convertPublicKey(ed25519PublicKey: Uint8Array): Uint8Array | null
  export function convertSecretKey(ed25519SecretKey: Uint8Array): Uint8Array
  export function convertKeyPair(keyPair: { publicKey: Uint8Array; secretKey: Uint8Array }): { publicKey: Uint8Array; secretKey: Uint8Array } | null
}
