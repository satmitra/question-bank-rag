import * as lancedb from "vectordb";
import { pipeline } from "@xenova/transformers";
import path from "path";
import fs from "fs";

let extractor: any = null;

export async function getExtractor() {
  if (!extractor) {
    // Load the model. This will run on CPU by default in Node.js.
    extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return extractor;
}

export async function getEmbeddings(text: string): Promise<number[]> {
  const pipe = await getExtractor();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data) as number[];
}

const DB_PATH = path.join(process.cwd(), "data", "vector_db");

export async function initDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(DB_PATH, { recursive: true });
  }
  const db = await lancedb.connect(DB_PATH);
  return db;
}

export async function getQuestionsTable() {
  const db = await initDb();
  const tableNames = await db.tableNames();

  if (tableNames.includes("questions_v2")) {
    return await db.openTable("questions_v2");
  } else if (tableNames.includes("questions")) {
    // Fallback to older table if v2 doesn't exist
    return await db.openTable("questions");
  } else {
    return null;
  }
}

export async function addToQuestionsTable(data: any[]) {
  const db = await initDb();
  const tableNames = await db.tableNames();

  if (tableNames.includes("questions_v2")) {
    const table = await db.openTable("questions_v2");
    await table.add(data);
  } else {
    await db.createTable("questions_v2", data);
  }
}

export async function searchQuestions(
  vector: number[],
  limit: number = 5,
  filters?: { subject?: string; class?: string },
) {
  const table = await getQuestionsTable();
  if (!table) return [];

  let query = table
    .search(vector)
    .limit(limit)
    .select(["text", "subject", "class_name", "source", "timestamp"]);

  if (filters) {
    const whereclauses = [];
    if (filters.subject && filters.subject !== "") {
      whereclauses.push(`subject = '${filters.subject.replace(/'/g, "''")}'`);
    }
    if (filters.class && filters.class !== "") {
      whereclauses.push(`class_name = '${filters.class.replace(/'/g, "''")}'`);
    }

    if (whereclauses.length > 0) {
      query = query.where(whereclauses.join(" AND "));
    }
  }

  const results = await query.execute();
  return results;
}

export async function getQuestionsCount() {
  const table = (await getQuestionsTable()) as any;
  if (!table) return 0;
  try {
    return await table.countRows();
  } catch (e) {
    console.warn("countRows failed, falling back to manual count:", e);
    try {
      const results = await table.search().execute();
      return results.length;
    } catch (e2) {
      return 0;
    }
  }
}

export async function getAllQuestions(
  limit: number = 20,
  offset: number = 0,
  search?: string,
) {
  const table = (await getQuestionsTable()) as any;
  if (!table) return [];

  try {
    const query = table.search();

    if (search) {
      // Use SQL-like where clause for text search
      // Note: for production, proper full-text search index would be better
      query.where(`text LIKE '%${search.replace(/'/g, "''")}%'`);
    }

    if (typeof query.limit === "function") {
      query.limit(offset + limit);
    }

    const results = await query.execute();

    // In-memory pagination because offset might not be supported on all versions' search builder
    const pagedResults = results.slice(offset, offset + limit);

    return pagedResults.map((row: any) => ({
      id: row.id,
      text: row.text,
      subject: row.subject,
      class_name: row.class_name,
      source: row.source,
      timestamp: row.timestamp,
    }));
  } catch (e) {
    console.error("All fetch attempts failed in getAllQuestions:", e);
    return [];
  }
}
