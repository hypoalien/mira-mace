# Mira Mace take home

A fresh, small Next.js scaffold for DME coordination. It uses the default neutral shadcn/ui theme and source components for the case list, supplier directory, and case view. The case header follows the original Mira Mace coordinator. The 60/40 workspace has a conversation placeholder on the left and an initial intake status overview on the right. No AI, chat panel, or Temporal workflow code is included yet.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Use **Create case from intake** on the Cases page. Each click creates a new JSON record in `data/cases/` from `data/intake.json`; those records are local and ignored by Git. The supplier directory reads `data/suppliers.json`.

## Docker

```bash
docker compose up --build
```

The compose file starts Next.js and a local Temporal development server. The Temporal UI is at http://localhost:8233. The app does not connect to Temporal yet; its container and connection setting are ready for the next step. Copy or edit `.env.example` if you need different local ports. The checked-in `.env` contains only local defaults and no secrets.

## API

`POST /api/cases` creates a new case from the fixed intake fixture and returns it with HTTP 201 and a `Location` header. The case store is a simple local JSON prototype intended for one app process, not a production database.
