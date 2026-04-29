# Anduril — AI Agent Task Manager

A lightweight task management system designed for AI coding agents (Antigravity/Claude/Codex). Provides a visual queue of prioritized tasks with image support, status tracking, and WebP optimization.

## Features

- **Priority-based task queue** — Tasks sorted by priority with visual indicators
- **Image support** — Drag-and-drop image attachments with automatic WebP conversion
- **Status lifecycle** — Pending → In Progress → Done workflow
- **JSON export** — Export task data for agent consumption
- **Auto-cleanup** — Images removed when tasks are deleted
- **Persistent storage** — Tasks saved to markdown file (`tasks.md`)

## Architecture

```
Anduril/
├── server.js          # Express API server (CRUD, image upload, WebP conversion)
├── start.bat          # Windows launcher with auto-restart
├── public/
│   ├── index.html     # Single-page app
│   ├── app.js         # Frontend logic
│   └── style.css      # UI styling
├── images/            # Uploaded task images (WebP)
└── tasks.md           # Persistent task storage
```

## Quick Start

```bash
npm install express sharp multer
node server.js
# Opens at http://localhost:3400
```

## API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tasks` | List all tasks |
| `POST` | `/api/tasks` | Create task |
| `PUT` | `/api/tasks/:id` | Update task |
| `DELETE` | `/api/tasks/:id` | Delete task + cleanup images |
| `POST` | `/api/tasks/:id/image` | Upload image (auto WebP) |

## Integration with AI Agents

Anduril is designed to be read by AI coding agents via the `/anduril` workflow command. The agent reads the task queue, picks the highest-priority pending task, executes it, and updates the status.

## License

Creative Commons Attribution 4.0 International (CC BY 4.0)
