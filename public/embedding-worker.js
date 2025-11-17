// Use the CDN-hosted version of Transformers.js
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1';

class EmbeddingPipeline {
    static task = 'feature-extraction';
    static model = 'Xenova/all-MiniLM-L6-v2';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = pipeline(this.task, this.model, { 
                quantized: true,
                progress_callback 
            });
        }
        return this.instance;
    }
}

// Listen for messages from the main thread
self.onmessage = async (event) => {
    const { type, text, textKey } = event.data;
    if (type !== 'generate-embedding') return;

    try {
        const embedder = await EmbeddingPipeline.getInstance();
        const output = await embedder(text, { pooling: 'mean', normalize: true });
        
        self.postMessage({
            status: 'complete',
            embedding: Array.from(output.data),
            textKey
        });

    } catch (e) {
        self.postMessage({ status: 'error', error: e.message, textKey });
    }
};

// Proactively initialize the pipeline and report status to the main thread
(async () => {
    try {
        self.postMessage({ status: 'loading' });
        await EmbeddingPipeline.getInstance(progress => {
            // Optional: Report progress back to the main thread
            // self.postMessage({ status: 'loading', progress });
        });
        self.postMessage({ status: 'ready' });
    } catch (e) {
        self.postMessage({ status: 'error', error: `Failed to initialize the embedding model: ${e.message}` });
    }
})();
