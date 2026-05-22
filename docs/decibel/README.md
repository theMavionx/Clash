# Decibel Documentation Snapshot

This directory stores the official Decibel docs snapshot used by ClashHermes.

- `llms.txt`: official Decibel docs map from https://docs.decibel.trade/llms.txt
- `llms-full.txt`: official full machine-readable docs from https://docs.decibel.trade/llms-full.txt

Refresh with:

```powershell
Invoke-WebRequest -Uri https://docs.decibel.trade/llms.txt -OutFile docs\decibel\llms.txt
Invoke-WebRequest -Uri https://docs.decibel.trade/llms-full.txt -OutFile docs\decibel\llms-full.txt
```

Hermes prompt guidance summarizes only the stable concepts and routes live account or market facts through MCP tools.
