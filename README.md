# 🌟 Gemini AI Chatbot (Decoupled Full-Stack Architecture)

A modern, fast, and feature-rich AI chatbot powered by Google Gemini LLM, built with a **strict architectural separation** between the **frontend** and **backend**.

---

## 📁 Project Architecture & Directory Structure

```
work shop/
├── backend/                  # 🖥️ Node.js + Express Backend Service
│   ├── .env                  # API Key & Server Environment Config (Gemini + Supabase)
│   ├── .env.example          # Template configuration
│   ├── package.json          # Backend dependencies (@google/genai, @supabase/supabase-js, express, cors, dotenv)
│   └── server.js             # API routes, streaming SSE handler & Supabase integration
│
├── frontend/                 # 🎨 Client UI (Vanilla HTML, CSS, JavaScript)
│   ├── .env                  # Frontend environment config (Supabase Anon Key + Backend URL)
│   ├── .env.example          # Template configuration
│   ├── index.html            # Semantic layout, header, chat area, sidebar & settings modal
│   ├── style.css             # Glassmorphism, animations, dark mode & responsive UI
│   └── app.js                # SSE client, history persistence, TTS, dictation & settings
│
├── supabase-schema.sql       # 🗄️ SQL Schema for Supabase Database
├── package.json              # Root runner scripts (quick start)
└── README.md                 # Complete documentation & usage guide
```

### ⚖️ Clear Separation of Concerns:
- **`backend/`**:
  - Securely handles the Google Gemini API key (never leaks credentials in client bundles).
  - Interfaces directly with Google's `@google/genai` official SDK.
  - Exposes RESTful endpoints and real-time Server-Sent Events (SSE) streaming (`POST /api/chat/stream`).
  - Implements CORS support for flexible hosting (frontend can run anywhere: port 3000, 5500, or local file).
- **`frontend/`**:
  - Completely client-side (no build steps, pure HTML5, modern Vanilla CSS, and modular ES6 JavaScript).
  - Handles real-time markdown parsing, syntax highlighting, text-to-speech, and microphone voice dictation.
  - Manages chat sessions and conversation history in `localStorage`.
  - Connects to the backend via standard HTTP/SSE requests.

---

## 🚀 Quick Start Guide

### Step 1: Get a Free Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Click **Create API Key** and copy your key.

### Step 2: Configure Your API Key
You can configure your key in **either of two ways**:
- **Option A (Recommended - Server Environment)**:
  Open `backend/.env` and paste your key:
  ```env
  GEMINI_API_KEY=AIzaSyYourActualKeyHere
  PORT=5000
  ```
- **Option B (Frontend UI Settings Modal)**:
  Launch the app, click the ⚙️ **Settings** icon in the top right, and paste your Gemini API key directly into the settings dialog. It will be passed securely via request headers.

### Step 3: Connect Supabase (Optional for Cloud Sync)
1. Create a project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** > **New Query**, paste the contents of `supabase-schema.sql`, and click **Run**.
3. In **Project Settings** > **API**, copy your **Project URL** and keys:
   - Fill in `backend/.env`:
     ```env
     SUPABASE_URL=https://your-project.supabase.co
     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
     SUPABASE_ANON_KEY=your_anon_key
     ```
   - Fill in `frontend/.env`:
     ```env
     SUPABASE_URL=https://your-project.supabase.co
     SUPABASE_ANON_KEY=your_anon_key
     BACKEND_URL=http://localhost:5000
     ```
*(Note: If Supabase is not configured, the chatbot seamlessly operates in **Local Storage mode** without any errors).*

---

### Step 4: Run the Application

From the root directory:
```bash
# Start the backend server
npm start
```
*(Or navigate to `backend/` and run `npm start`)*

The server will display:
```
====================================================
  🚀 Gemini Chatbot Backend Server running!
  🔗 Local API URL:  http://localhost:5000/api
  🌐 Frontend View:  http://localhost:5000
====================================================
```

### Step 4: Open the Chatbot in your Browser
- Simply open: **[http://localhost:5000](http://localhost:5000)** in your browser!
- *Alternative:* You can also open `frontend/index.html` directly in any web browser or use Live Server (`http://127.0.0.1:5500`), as CORS is fully enabled.

---

## 🛠️ Backend API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check, detects if `GEMINI_API_KEY` is loaded in `.env`. |
| `GET` | `/api/models` | Returns available Gemini models (`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-1.5-flash`). |
| `POST` | `/api/test-key` | Validates an API key with a 1-token test ping. |
| `POST` | `/api/chat` | Non-streaming standard completion with conversation history. |
| `POST` | `/api/chat/stream`| Real-time Server-Sent Events (SSE) streaming response. |

---

## 🎨 Frontend Features

1. **Rich Glassmorphic Design**:
   - Modern dark slate palette with glowing Gemini gradients (`#4285f4`, `#9b51e0`, `#00d2ff`).
   - Smooth micro-interactions, responsive sidebar, and pulsing state indicators.
2. **Real-time SSE Streaming**:
   - Words stream in live as Gemini generates them with a typing effect.
3. **Markdown & Code Highlighting**:
   - Renders GitHub-flavored markdown, tables, blockquotes, and lists.
   - Code blocks with syntax highlighting (Atom One Dark) and instant one-click **"Copy Code"** buttons.
4. **Voice & Audio Capabilities**:
   - 🎙️ **Speech-to-Text**: Click the microphone icon to dictate your prompts.
   - 🔊 **Text-to-Speech**: Click "Listen" on any AI response to read it aloud.
5. **Multiple Model & Persona Support**:
   - Switch between **Gemini 2.5 Flash**, **Gemini 2.5 Pro**, **Gemini 1.5 Flash**, and **Gemini 1.5 Pro**.
   - Select system persona presets: *General Assistant*, *Senior Software Architect*, *Concise Explainer*, or *Creative Innovator*.
6. **Chat History & Sessions**:
   - Automatic session creation with titles based on your initial prompt.
   - Switch between past conversations or delete them at any time.
   - Stored persistently in browser `localStorage`.
7. **Interactive Suggestion Cards**:
   - Instant 1-click starter prompts on the welcome screen.
