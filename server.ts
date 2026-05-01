import express from 'express';
import 'dotenv/config';
import multer from 'multer';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { getEmbeddings, addToQuestionsTable, searchQuestions, getAllQuestions, getQuestionsCount } from './src/lib/vectorDb.ts';
import { validateIntent, queryTutorChain, performOCR } from './src/lib/langchainService.ts';
import { runAutomatedEval } from './src/lib/langfuseEvaluation.ts';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

/**
 * Robustly splits a text block into individual academic questions.
 * Handles diverse numbering systems and groups sub-parts (like a, b, i, ii) 
 * with their parent questions for better context retrieval.
 */
function splitIntoQuestions(text: string): string[] {
  // Normalize whitespace and remove excessive newlines
  const normalizedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 1. PRIMARY SPLITTING: Detect major boundaries
  // - Starts with "Question X", "Q. X", etc.
  // - Starts with numeric pattern "1.", "1)", "(1)", "[1]" 
  // - Starts with sub-parts "i.", "ii.", "a.", "b." if they are at start of line
  // Improved to catch more subpart letters (a-z) and handle more numbering styles
  const mainSplitRegex = /(?=(?:^|\n)\s*(?:Question|Q\.?|Problem|Exercise|Ex\.?|Task)\s*\d+)|(?=(?:^|\n)\s*(?:\d+[.\)\]]|\(\d+\)))|(?=(?:^|\n)\s*(?:Section|Part|Module|Unit)\s+[A-Z0-9])|(?=(?:^|\n)\s*(?:[a-z]|[ivx]+)[.\)\]])/gi;

  const initialChunks = normalizedText.split(mainSplitRegex)
    .map(c => c.trim())
    .filter(c => c.length > 0);

  const questions: string[] = [];
  let currentHeader = '';
  let currentBlock = '';

  // 2. HEURISTIC GROUPING: 
  for (const chunk of initialChunks) {
    // Detect if this chunk is a major question/section header
    const isHeader = /^(?:Section|Part|Module|Unit|Question|Q\.?)\s+/i.test(chunk) || /^\d+[.\)\]]\s+/.test(chunk);
    
    // Detect if this chunk is a sub-part: (a), b., i., iv)
    const isSubPart = /^(?:[a-z]|[ivx]+)[.\)\]]/i.test(chunk);
    
    if (isHeader) {
      if (currentBlock) questions.push(currentBlock);
      currentHeader = chunk.split('\n')[0].replace(/\[\d+×\d+=\d+\]/g, '').trim(); // Contextual header, strip marks like [1x10=10]
      currentBlock = chunk;
    } else if (isSubPart && currentHeader) {
      // If we see a subpart, we push the current block (if it exists and isn't just the header)
      // and start a new block with the header context
      if (currentBlock && currentBlock !== currentHeader) {
        questions.push(currentBlock);
      }
      currentBlock = `${currentHeader}\n\n${chunk}`;
    } else {
      // If it's a random fragment or continuation, append to the current active block
      if (currentBlock) {
        currentBlock += '\n\n' + chunk;
      } else {
        currentBlock = chunk;
      }
    }
  }
  
  if (currentBlock) questions.push(currentBlock);

  // 3. FINAL CLEANUP: Remove duplicates and very short fragments
  return [...new Set(questions)].filter(q => {
    const words = q.split(/\s+/).length;
    return words >= 4 && q.length > 15;
  });
}

app.use(express.json());

// API Routes
app.post('/api/query', async (req, res) => {
  try {
    const { query, subject: filterSubject, class: filterClass } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const result = await queryTutorChain(query, { subject: filterSubject, class: filterClass });
    
    if (result.status === 'REJECTED') {
      return res.json({ 
        status: 'REJECTED',
        reason: result.reason 
      });
    }

    res.json({ 
      status: 'VALID', 
      answer: result.answer,
      raw_questions: result.context.map((q: any) => ({
        text: q.text,
        metadata: {
          source: q.source,
          subject: q.subject,
          class: q.class_name,
          timestamp: q.timestamp
        }
      }))
    });
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: 'Internal server error during query processing' });
  }
});

app.post('/api/ingest', upload.single('file'), async (req, res) => {
  try {
    const { subject, class: className } = req.body;
    let text = '';
    let source = '';

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const file = req.file;
    source = file.originalname;

    if (file.mimetype === 'application/pdf') {
      const parser = new PDFParse({ data: file.buffer });
      const pdfData = await parser.getText();
      text = pdfData.text;
    } else if (file.mimetype.startsWith('image/')) {
      // Perform backend OCR with Groq Vision
      const base64Image = file.buffer.toString('base64');
      text = await performOCR(base64Image, file.mimetype);
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Please upload PDF or Image.' });
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Could not extract text from the provided file.' });
    }

    // Advanced splitting logic to accurately identify and separate questions
    const questionChunks = splitIntoQuestions(text);

    const timestamp = new Date().toISOString();

    const records = [];
    for (const chunk of questionChunks) {
      const vector = await getEmbeddings(chunk);
      records.push({
        id: crypto.randomUUID(),
        text: chunk,
        vector: vector,
        source: source,
        timestamp: timestamp,
        subject: subject || 'Unknown',
        class_name: className || 'Unknown'
      });
    }

    if (records.length > 0) {
      await addToQuestionsTable(records);
    }

    res.json({ 
      message: 'Ingestion successful', 
      count: records.length,
      source 
    });
  } catch (error) {
    console.error('Ingestion error:', error);
    res.status(500).json({ error: 'Failed to ingest PDF' });
  }
});

app.post('/api/evaluate', async (req, res) => {
  try {
    const results = await runAutomatedEval();
    res.json({ status: 'COMPLETED', results });
  } catch (error) {
    console.error('Evaluation triggered error:', error);
    res.status(500).json({ error: 'Evaluation failed' });
  }
});

app.get('/api/database', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string || '';
    const offset = (page - 1) * limit;

    const [questions, total] = await Promise.all([
      getAllQuestions(limit, offset, search),
      getQuestionsCount()
    ]);

    res.json({
      data: questions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Database fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch database contents' });
  }
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Global Error Handler to ensure JSON responses
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    status: 'ERROR'
  });
});

startServer();
