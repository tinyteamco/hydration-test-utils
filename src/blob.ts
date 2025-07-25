/**
 * Encodes a string to URL-safe base64 format
 * Works in both Node.js and browser environments
 * @param json - The JSON string to encode
 * @returns URL-safe base64 encoded string (no +, /, or = characters)
 */
export function encodeUrlSafeBase64(json: string): string {
  let base64: string;
  
  if (typeof Buffer !== 'undefined') {
    // Node.js environment
    base64 = Buffer.from(json, 'utf-8').toString('base64');
  } else if (typeof TextEncoder !== 'undefined') {
    // Modern browser environment - use TextEncoder for proper Unicode handling
    const encoder = new TextEncoder();
    const bytes = encoder.encode(json);
    const binaryString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
    base64 = btoa(binaryString);
  } else {
    // Legacy browser fallback (deprecated but kept for compatibility)
    base64 = btoa(unescape(encodeURIComponent(json)));
  }
  
  // Convert to URL-safe base64 by replacing characters and removing padding
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Decodes a URL-safe base64 string back to original string
 * Works in both Node.js and browser environments
 * @param str - The URL-safe base64 string to decode
 * @returns Decoded JSON string
 */
export function decodeUrlSafeBase64(str: string): string {
  // Convert URL-safe base64 back to standard base64
  let base64 = str
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  // Add padding if necessary
  while (base64.length % 4) {
    base64 += '=';
  }
  
  try {
    if (typeof Buffer !== 'undefined') {
      // Node.js environment
      return Buffer.from(base64, 'base64').toString('utf-8');
    } else if (typeof TextDecoder !== 'undefined') {
      // Modern browser environment - use TextDecoder for proper Unicode handling
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoder = new TextDecoder();
      return decoder.decode(bytes);
    } else {
      // Legacy browser fallback (deprecated but kept for compatibility)
      return decodeURIComponent(escape(atob(base64)));
    }
  } catch (error) {
    throw new Error('Invalid base64 input');
  }
}

/**
 * Creates an encoded hydration blob from data.
 * The blob is URL-safe and can be passed via query parameters or stored in various contexts.
 * 
 * @param data - The data to encode (typically an object with section keys matching your registry)
 * @returns A URL-safe base64 encoded string
 * 
 * @example
 * const blob = createHydrationBlob({
 *   user: { name: 'Alice', id: 123 },
 *   settings: { theme: 'dark' }
 * });
 * // Use in URL: /app?hydrate={blob}
 * // Or inject: window.__HYDRATION_BLOB__ = blob;
 */
export function createHydrationBlob(data: any): string {
  // Convert the data to JSON string
  const jsonString = JSON.stringify(data);
  
  // Use consistent encoding for both environments
  return encodeUrlSafeBase64(jsonString);
}

/**
 * Decodes a hydration blob back to its original data.
 * 
 * @param blob - The URL-safe base64 encoded blob string
 * @returns The decoded data object
 * @throws {Error} If the blob is invalid or contains malformed JSON
 * 
 * @example
 * const data = decodeHydrationBlob(blob);
 * console.log(data); // { user: { name: 'Alice', id: 123 }, settings: { theme: 'dark' } }
 */
export function decodeHydrationBlob(blob: string): any {
  // Validate input is a string
  if (typeof blob !== 'string') {
    throw new Error('Input must be a string');
  }

  try {
    // Use consistent decoding for both environments
    const jsonString = decodeUrlSafeBase64(blob);
    
    // Parse JSON string back to original data
    return JSON.parse(jsonString);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid JSON in decoded blob');
    }
    throw new Error('Failed to decode blob: ' + (error as Error).message);
  }
}