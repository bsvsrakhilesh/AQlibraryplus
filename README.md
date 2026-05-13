# SmartScrape

SmartScrape is a platform designed for governance and policy work and help in collecting, organizing, storing and analyzing web-based and personal documents for governance organizations or institutions so that we can have citations backend evidence for new decisions and searchable documents.

## Overview

The platform brings together four connected workflows:

1. Collect material from the web through the URL Collector, where users can search, inspect, deduplicate, and capture high-signal pages as text or PDF. Collect source material from the web in a structured way, turning scattered links into preserved research inputs

2. Organize saved URLs, PDFs, uploads, and evidence with metadata and structured tags in a structured library.

3. Trace relationships across agencies, timelines, issues or past context in the Governance Workspace. It records across agencies and decisions so users can understand what happened, who acted, and what remains unresolved

4. Brief and analyze from the archive by assembling relevant sources into evidence-backed notes, summaries, and working drafts.

The goal is to make air-quality governance faster to review, easier to trace, and more auditable across institutions such as CAQM and related state agencies. More broadly, SmartScrape is designed for any research or governance setting where documents are fragmented across websites, formats, and individual knowledge silos.

## Statement of need

Documents and notifications from various governance bodies are either stored in their respective databases or in paper form, which is often hard to access and requires permissions. Likewise, online newspaper articles become unavailable after a specific period. Although documents can be collected and searched, current workflows frequently break provenance across heterogeneous, changing sources, and existing LLM tools do not reliably support evidence-linked answers or grounded retrieval of relevant context. Therefore, the approach is to develop an LLM-backed tool that allows you to capture screenshots of the required documents using their URLs, save them in the tool’s database with LLM-generated tags for better searchability, and create a metadata schema to structure the database. Then there is a notebook page where you can interact with the database, using cited answers and grounded document retrieval to cite from the tool’s database. This way, documents from various government agencies and newspaper articles are in one place, enabling efficient planning for future work

## Key features

### Research Impact & Evidence Integrity

- **Evidence-Backed Policy Analysis** — Centralized repository for fragmented governance documents; prevents loss of sources that disappear from web (newspapers, agency pages); enables reproducible research with cited evidence trails
- **Cross-Agency Pattern Discovery** — Trace policy decisions and their consequences across multiple institutions; identify timeline relationships and decision dependencies for comparative governance research
- **Grounded AI Analysis** — LLM-backed insights that don't hallucinate; all outputs anchored to source documents with citation links; reduces analyst time on manual review and categorization
- **Provenance & Auditability** — Maintains citation links to original sources; records capture metadata (date, context, version); enables verification and supports institutional knowledge preservation
- **Institutional Continuity** — Archives ephemeral web content before it disappears; captures decision rationale and organizational context; supports longitudinal governance studies

### Data Collection & Organization

- **URL Collector with Deduplication** — Search, inspect, and capture web pages as text or PDF; automatic deduplication prevents redundant data; structured capture of web-sourced evidence
- **Flexible Multi-Format Support** — Handles web pages, PDFs, and text uploads with unified storage and searchable archive
- **Intelligent Metadata & Tagging** — AI-powered automated tagging using LLM-based taxonomy system; customizable structured tags (CAQM taxonomy included as example); full-text search across documents and metadata
- **Governance Workspace** — Map connections across agencies, decisions, timelines, and issues; track authorship and policy dependencies; create audit trails for governance decisions

### Technical Architecture

- **Reproducible & Scalable** — Docker-based deployment with containerized frontend, backend, and AI components; production and development configurations; Prisma ORM for database migrations
- **Extensible Taxonomy System** — Composable taxonomy structure enabling domain-specific customization for different governance contexts
- **Notebook Environment** — Interactive analysis and briefing interface for assembling evidence-backed notes, summaries, and working drafts from the archive

## Installation

## Requirements

## Quick start

## Input data format

## Output files

## Example workflow

## Repository structure

## Documentation

## Testing and verification

## Development status

## Citation

## License

## Contact / support
