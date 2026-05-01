# Question Bank RAG

An AI-powered Question-Answering system that uses Retrieval-Augmented Generation (RAG) to provide fast, contextually accurate answers from uploaded document sets.

## 🚀 Features

- **Document Ingestion**: Upload PDF or text files to build your local knowledge base.
- **RAG Architecture**: Uses LanceDB for efficient vector storage and `@xenova/transformers` for local embedding generation.
- **High-Performance Inference**: Integration with Groq for near-instant responses using advanced LLMs (via LangChain).
- **Langfuse Observability**:
  - Full trace logging of LLM calls.
  - Automated evaluation runs to measure accuracy.
  - Experiment tracking to iterate on prompts and parameters.
- **Beautiful UI**: Built with React, Tailwind CSS (using the typography plugin for clean markdown rendering), and Framer Motion for smooth transitions.

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS 4, Framer Motion
- **AI/LLM**: LangChain, Groq SDK
- **Database/Vector**: LanceDB (`vectordb`)
- **Observability**: Langfuse, Langfuse-LangChain
- **Processing**: `pdf-parse` for document extraction, `@xenova/transformers` for local embeddings

## 🚦 Getting Started

### Prerequisites

- Node.js (v18+)
- Groq API Key
- Langfuse Project Credentials

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/question-bank-rag.git
   cd question-bank-rag
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables in `.env`:
   ```env
   GROQ_API_KEY=your_groq_key
   LANGFUSE_PUBLIC_KEY=your_public_key
   LANGFUSE_SECRET_KEY=your_secret_key
   LANGFUSE_BASEURL=https://cloud.langfuse.com
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

### Evaluation & Seeding

- **Seed Dataset**: To set up a "Golden Questions" dataset for evaluation in Langfuse:
  ```bash
  npm run seed:evals
  ```
- **Run Evaluations**: Measure the performance of the RAG system against your dataset:
  ```bash
  npm run test:eval
  ```

## 📈 Monitoring

Access your [Langfuse Dashboard](https://cloud.langfuse.com) to monitor latency, token usage, and evaluation scores in real-time.

## 📄 License

MIT
