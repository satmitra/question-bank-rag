import { Langfuse } from "langfuse";
import { queryTutorChain } from "./langchainService";

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY || "",
  secretKey: process.env.LANGFUSE_SECRET_KEY || "",
  baseUrl: process.env.LANGFUSE_BASEURL || "https://cloud.langfuse.com",
});

export async function runAutomatedEval() {
  const testCases = [
    { query: "Pinworm phylum", expected: "Nematoda" },
    { query: "Connective tissue lacking RBC", expected: "Lymph" },
    { query: "Phylum Mollusca locomotory organ", expected: "Muscular foot" },
  ];

  const results = [];

  for (const test of testCases) {
    const trace = langfuse.trace({
      name: "Automated Evaluation",
      input: test.query,
      metadata: { expected: test.expected }
    });

    try {
      const result = await queryTutorChain(test.query, {});
      
      // Simple automated evaluation: check if expected keyword is in answer
      const score = result.answer.toLowerCase().includes(test.expected.toLowerCase()) ? 1 : 0;

      trace.update({
        output: result.answer,
      });

      trace.score({
        name: "exact_match_keyword",
        value: score,
        comment: `Expected: ${test.expected}`
      });

      results.push({ query: test.query, score, answer: result.answer });
    } catch (error) {
      console.error(`Eval error for ${test.query}:`, error);
      results.push({ query: test.query, score: 0, error: "Chain failed" });
    }
  }

  await langfuse.flushAsync();
  return results;
}
