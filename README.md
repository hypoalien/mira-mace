# Mira Mace DME demo

A Next.js and Temporal demo for coordinating wheelchair cases. It uses a local JSON case store and simulated supplier, PCP, and patient responses.

## Run the demo

Install Docker Desktop, then:

```bash
git clone <repository-url>
cd mira-mace-takehome
cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env`, then start everything:

```bash
docker compose up
```

Open the [case list](http://localhost:3000) and create a case from the intake fixture. Start the DME agent on that case. You can answer simulated calls yourself or turn on **Auto mock** to run a configured scenario. The [Temporal UI](http://localhost:8233) shows the workflows.

To stop the demo, press Ctrl+C and run `docker compose down`. Case JSON and Temporal history remain in Docker volumes, so another `docker compose up` resumes them. To rebuild after changing code, run `docker compose up --build`.
