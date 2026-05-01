import { describe, it, expect, beforeAll } from 'vitest';
import { Langfuse } from "langfuse";
import { queryTutorChain } from "./src/lib/langchainService";
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY || "",
  secretKey: process.env.LANGFUSE_SECRET_KEY || "",
  baseUrl: process.env.LANGFUSE_BASEURL || "https://cloud.langfuse.com",
});

describe('RAG Evaluation Experiment', () => {
  let dataset: any;

  beforeAll(async () => {
    try {
      // Fetch the "Golden Dataset" from Langfuse
      // Note: This dataset must exist in your Langfuse project
      dataset = await langfuse.getDataset("Golden Questions");
      console.log(`Fetched dataset: ${dataset.name} with ${dataset.items.length} items`);
    } catch (error) {
      console.warn("Could not fetch 'Golden Questions' dataset. Ensure it exists in Langfuse.");
      // Fallback for demo purposes if dataset doesn't exist
      dataset = {
        items: [
          { input: "What is Pinworm phylum?", expected_output: "Nematoda" },
          { input: "What is the locomotory organ in Mollusca?", expected_output: "Muscular foot" }
        ]
      };
    }
  });

  it('runs the RAG chain for each dataset item and logs results to Langfuse', async () => {
    const experimentName = `RAG_Experiment_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    
    for (const item of dataset.items) {
      const startTime = Date.now();
      
      const query = typeof item.input === 'string' ? item.input : JSON.stringify(item.input);
      
      const trace = langfuse.trace({
        name: "test-evaluation",
        input: query,
        metadata: {
          datasetName: "Golden Questions",
          experimentName: experimentName
        }
      });

      // Execute the chain
      const result = await queryTutorChain(query, {});
      const latency = (Date.now() - startTime) / 1000;

      // Update trace with output and metadata
      trace.update({
        output: result.answer,
        metadata: {
          latency,
          status: result.status
        }
      });

      // Log results back to Langfuse for this dataset item
      // @ts-ignore - linking trace to dataset item
      await item.link(trace, experimentName);

      // Assertions
      expect(result.answer).not.toBe('');
      expect(result.answer.length).toBeGreaterThan(10);
      expect(latency).toBeLessThan(5); // Requirement: latency below 5 seconds

      console.log(`Item: ${query.substring(0, 30)}... | Latency: ${latency}s | Status: ${result.status}`);
    }

    await langfuse.flushAsync();
  }, 30000); // 30s timeout for the whole loop
});
