import { Langfuse } from "langfuse";
import * as dotenv from "dotenv";

dotenv.config();

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY || "",
  secretKey: process.env.LANGFUSE_SECRET_KEY || "",
  baseUrl: process.env.LANGFUSE_BASEURL || "https://cloud.langfuse.com",
});

async function seedDataset() {
  const datasetName = "Golden Questions";
  
  console.log(`Checking for dataset: ${datasetName}...`);

  const seedItems = [
    { input: "What phylum does a pinworm belong to?", expected_output: "Nematoda" },
    { input: "Which connective tissue lacks RBCs?", expected_output: "Lymph" },
    { input: "What is the locomotory organ in phylum Mollusca?", expected_output: "Muscular foot" },
    { input: "Define the term 'Diploblastic'.", expected_output: "Organisms with two germ layers: ectoderm and endoderm." },
    { input: "What is the function of Nephridia in Annelids?", expected_output: "Excretion and osmoregulation" }
  ];

  try {
    // Create the dataset (this will fail if it already exists, so we catch it)
    try {
      await langfuse.createDataset({ name: datasetName });
      console.log(`Created dataset: ${datasetName}`);
    } catch (e) {
      console.log(`Dataset ${datasetName} already exists or error occurred. Proceeding to add items.`);
    }

    for (const item of seedItems) {
      await langfuse.createDatasetItem({
        datasetName: datasetName,
        input: item.input,
        expectedOutput: item.expected_output
      });
      console.log(`Added item: ${item.input.substring(0, 30)}...`);
    }

    console.log("Seeding complete!");
  } catch (error) {
    console.error("Error seeding dataset:", error);
  } finally {
    await langfuse.flushAsync();
  }
}

seedDataset();
