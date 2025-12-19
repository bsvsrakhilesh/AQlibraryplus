# SmartScrape

## AI tagging (OpenAI)

The "Suggest tags (AI)" button queues a job in the Python service in `ai-tagger/` and persists the result via the backend.

To enable OpenAI-based tag reranking:
- Set `TAGS_USE_LLM=true` for the backend (see `backend/.env`)
- Provide `OPENAI_API_KEY` to the `ai-tagger-worker` container (optional: `LLM_MODEL`, default `gpt-4o-mini`)

Docker dev (PowerShell):

```powershell
$env:OPENAI_API_KEY="sk-..."
$env:LLM_MODEL="gpt-4o-mini"  # optional
docker compose -f docker-compose.dev.yml up --build
```
