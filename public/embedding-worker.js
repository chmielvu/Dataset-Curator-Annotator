
// Use the CDN-hosted version of Transformers.js
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1';

// Cache the pipeline instance to avoid reloading
let embeddingPipe = null;

self.onmessage = async (event) => {
    const { type, text, textKey } = event.data;

    if (type === 'generate-embedding') {
        try {
            // Load model on first call.
            if (embeddingPipe === null) {
                self.postMessage({ status: 'loading' });
                embeddingPipe = await pipeline(
                    'feature-extraction',
                    'Xenova/all-MiniLM-L6-v2', // SOTA small, fast embedding model
                    { quantized: true } // Use quantized model for speed
                );
                self.postMessage({ status: 'ready' });
            }

            // Generate embedding for the text
            const output = await embeddingPipe(text, { pooling: 'mean', normalize: true });

            // Send back the raw embedding data
            self.postMessage({ status: 'complete', embedding: Array.from(output.data), textKey });

        } catch (e) {
            self.postMessage({ status: 'error', error: e.message, textKey });
        }
    }
};
