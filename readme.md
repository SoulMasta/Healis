**It's project Healis. A platform for knowledge sharing specially for Sechenov university students**

*Technology stack: PERN*


A platform for sharing knowledge between students of Sechenov University. The main idea of the platform is a user-friendly and beautiful interface for students. The main workspace for students will be an interactive whiteboard similar to the Apple Freeform app. Students will be able to attach materials in the form of various design stickers for notes on the whiteboard. They will also be able to attach links to videos with previews on the whiteboard. An important feature is the ability to comment on notes, react to them like in Telegram, and highlight the most important notes. A separate workspace with an interactive whiteboard can be created for each subject.

When a student enters the app, they are greeted by a registration/login page. There are 4 main pages: the main menu with a search for their university group and a list of workspaces (the user starts with 0 workspaces); a workspace in the form of an interactive whiteboard, similar to Apple's Freeform; app settings with the option to customize the app's appearance (dark or light theme); and a calendar with upcoming events such as tests, exams, and retakes.
  
In the future, integration with an AI service will be implemented to analyze the information added to the interactive whiteboard. There will be a separate chat/tab with AI** 

The app will also work with notifications for students about upcoming tests, exams, retakes, and updates in the LC. This can be viewed in the calendar tab. First, we need to implement the function of adding events to the calendar and sending notifications.

## Auth (email/password + Google)

Backend uses **JWT access tokens** (stored in `localStorage`) + **httpOnly refresh cookie** (rotated on `/api/user/refresh`).

### Email/password registration requirements

When creating an account inside the app (`/api/user/registration`) you must provide:

- `username` (required, 3-32 chars: `a-z`, `0-9`, `_`)
- `nickname` (required)
- `email` (required)
- `password` (required, min 8 chars)
- optional: `studyGroup`, `faculty`, `course` (1..10)

### Google Sign-In setup

Google flow is: client gets **Google ID token** → sends it to server `/api/user/google` → server verifies and issues the same access/refresh tokens.

Add env vars:

- **Server** (`server/.env`): `GOOGLE_CLIENT_ID=...`
- **Client** (`client/.env`): `REACT_APP_GOOGLE_CLIENT_ID=...`

In Google Cloud Console create an **OAuth 2.0 Client ID (Web application)** and add your dev origins:

- `http://localhost:3000`
- `http://localhost:5000` (optional, if you open the app via backend)

## AI (local, Ollama)

Basic AI is wired into the workspace (whiteboard): there is a chat icon in the top-right toolbar. The backend sends the current desk (board) content to a local Ollama model and returns the reply/summarization.

### Requirements

- Ollama running locally at `http://localhost:11434`
- Model: `llama3.2:3b`

### Setup

1) Install/pull the model:

`ollama pull llama3.2:3b`

2) Configure server env (in `server/.env`):

- `AI_PROVIDER=ollama`
- (optional) `AI_OLLAMA_MODEL=llama3.2:3b`
- (optional) `AI_OLLAMA_HOST=http://localhost:11434`
- (optional) `AI_CONTEXT_CHARS=12000`

3) Start server + client and open a workspace. Use the chat panel to ask questions or press **Суммаризация**.
    