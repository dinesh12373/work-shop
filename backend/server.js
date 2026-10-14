/**
 * Gemini Chatbot Backend Server
 * Demonstrates clean separation between frontend and backend.
 * Handles Gemini API interactions securely using the official @google/genai SDK.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables from backend/.env
dotenv.config({ path: path.join(__dirname, '.env') });

// Also load frontend/.env if present for shared configuration
const frontendEnv = dotenv.config({ path: path.join(__dirname, '..', 'frontend', '.env') }).parsed || {};

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL || frontendEnv.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || frontendEnv.SUPABASE_ANON_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log(`  ⚡ Supabase: Connected to ${supabaseUrl}`);
  } catch (err) {
    console.warn(`  ⚠️ Supabase init warning:`, err.message);
  }
} else {
  console.log(`  ℹ️ Supabase: Not configured (Using localStorage persistence)`);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve frontend static assets if accessed via backend port
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

/**
 * Helper to resolve the Gemini API key:
 * 1. Checks request header 'x-api-key' or Authorization header
 * 2. Checks request body 'apiKey'
 * 3. Falls back to process.env.GEMINI_API_KEY
 */
function resolveApiKey(req) {
  const headerKey = req.headers['x-api-key'] || (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, ''));
  const bodyKey = req.body && req.body.apiKey;
  const envKey = process.env.GEMINI_API_KEY;

  return (headerKey || bodyKey || envKey || '').trim();
}

/**
 * Helper to clean up error messages from GoogleGenAI SDK
 */
function formatErrorMessage(err) {
  if (!err) return 'An unexpected error occurred.';
  const msg = err.message || String(err);
  try {
    const parsed = JSON.parse(msg);
    if (parsed.error && parsed.error.message) {
      return parsed.error.message;
    }
  } catch (e) {
    // not JSON formatted
  }
  return msg;
}

/**
 * Format conversation history into @google/genai format:
 * Array of { role: 'user' | 'model', parts: [{ text: '...' }] }
 */
function formatHistory(history) {
  if (!Array.isArray(history)) return [];

  return history.map(item => {
    let role = item.role === 'assistant' || item.role === 'model' ? 'model' : 'user';
    let text = '';
    if (typeof item.content === 'string') {
      text = item.content;
    } else if (typeof item.text === 'string') {
      text = item.text;
    } else if (Array.isArray(item.parts)) {
      text = item.parts.map(p => p.text || '').join('');
    }
    return {
      role,
      parts: [{ text }]
    };
  });
}

/**
 * GET /api/health
 * Checks backend health, Gemini API key, and Supabase connection status.
 */
app.get('/api/health', (req, res) => {
  const hasEnvKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5);
  const hasSupabase = Boolean(supabaseUrl && supabaseKey);
  res.json({
    status: 'ok',
    service: 'Gemini Chatbot Backend',
    hasEnvKey,
    hasSupabase,
    supabaseConnected: Boolean(supabase),
    defaultModel: process.env.DEFAULT_MODEL || frontendEnv.DEFAULT_MODEL || 'gemini-2.5-flash',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/config
 * Exposes public client configuration (Safe for browser frontend)
 */
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || frontendEnv.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || frontendEnv.SUPABASE_ANON_KEY || '',
    backendUrl: process.env.BACKEND_URL || frontendEnv.BACKEND_URL || `http://localhost:${PORT}`,
    defaultModel: process.env.DEFAULT_MODEL || frontendEnv.DEFAULT_MODEL || 'gemini-2.5-flash',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5),
    hasSupabase: Boolean(supabaseUrl && supabaseKey)
  });
});

/**
 * POST /api/test-supabase
 * Verifies Supabase connection and tests database table access
 */
app.post('/api/test-supabase', async (req, res) => {
  const targetUrl = (req.body && req.body.supabaseUrl) || supabaseUrl;
  const targetKey = (req.body && req.body.supabaseKey) || supabaseKey;

  if (!targetUrl || !targetKey) {
    return res.status(400).json({
      success: false,
      error: 'Supabase URL or Key missing. Please check .env or enter in Settings.'
    });
  }

  try {
    const testClient = createClient(targetUrl, targetKey);
    const { data, error } = await testClient.from('conversations').select('id').limit(1);

    if (error) {
      if (error.message && error.message.includes('relation "public.conversations" does not exist')) {
        return res.json({
          success: true,
          message: 'Connected to Supabase! (Note: run supabase-schema.sql in Supabase SQL editor to create the tables).'
        });
      }
      throw error;
    }

    return res.json({
      success: true,
      message: 'Supabase connection verified and tables are ready!'
    });
  } catch (err) {
    console.error('Supabase test error:', err.message);
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to connect to Supabase.'
    });
  }
});

/**
 * GET /api/conversations
 * Fetch all conversations from Supabase (if configured)
 */
app.get('/api/conversations', async (req, res) => {
  if (!supabase) {
    return res.json({ success: true, conversations: [], source: 'local' });
  }

  try {
    const { data: convos, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (convError) throw convError;

    const result = [];
    for (const c of (convos || [])) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', c.id)
        .order('created_at', { ascending: true });

      result.push({
        id: c.id,
        title: c.title,
        model: c.model,
        createdAt: c.created_at,
        messages: (msgs || []).map(m => ({
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }))
      });
    }

    res.json({ success: true, conversations: result, source: 'supabase' });
  } catch (err) {
    console.warn('Supabase fetch conversations warning:', err.message);
    res.json({ success: false, error: err.message, conversations: [], source: 'local' });
  }
});

/**
 * POST /api/conversations
 * Upsert conversation and messages to Supabase
 */
app.post('/api/conversations', async (req, res) => {
  if (!supabase) return res.json({ success: true, source: 'local' });

  const { id, title, model, messages = [] } = req.body;
  if (!id) return res.status(400).json({ error: 'Conversation id is required.' });

  try {
    await supabase.from('conversations').upsert({
      id,
      title: title || 'New Conversation',
      model: model || 'gemini-2.5-flash',
      updated_at: new Date().toISOString()
    });

    if (messages.length > 0) {
      await supabase.from('messages').delete().eq('conversation_id', id);
      const rows = messages.map(m => ({
        conversation_id: id,
        role: m.role,
        content: m.content
      }));
      await supabase.from('messages').insert(rows);
    }

    res.json({ success: true, id });
  } catch (err) {
    console.error('Supabase save error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/conversations/:id
 * Delete conversation from Supabase
 */
app.delete('/api/conversations/:id', async (req, res) => {
  if (!supabase) return res.json({ success: true, source: 'local' });

  try {
    await supabase.from('conversations').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/models
 * Returns available Gemini models with metadata
 */
app.get('/api/models', (req, res) => {
  res.json({
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Next-gen, fast & highly capable for everyday tasks', recommended: true },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Advanced reasoning, coding, and complex analysis', recommended: false },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'High speed, lightweight and dependable', recommended: false },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Proven high-capacity reasoning model', recommended: false }
    ]
  });
});

/**
 * POST /api/test-key
 * Validates a Gemini API Key with a lightweight ping
 */
app.post('/api/test-key', async (req, res) => {
  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    return res.status(400).json({
      success: false,
      error: 'No API key provided. Please configure GEMINI_API_KEY in backend/.env or enter it in Settings.'
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: 'Ping test. Reply with one word: OK' }] }]
    });

    const reply = response.text ? response.text.trim() : 'OK';
    return res.json({
      success: true,
      message: 'API key is valid and connected to Gemini!',
      reply
    });
  } catch (err) {
    const errorMsg = formatErrorMessage(err);
    console.error('API Key validation error:', errorMsg);
    return res.status(401).json({
      success: false,
      error: errorMsg
    });
  }
});

/**
 * POST /api/chat
 * Handles chat messages with conversation history, system prompt, and temperature
 */
app.post('/api/chat', async (req, res) => {
  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    return res.status(401).json({
      error: 'Gemini API Key missing. Please set GEMINI_API_KEY in backend/.env or pass it in settings.'
    });
  }

  const {
    message,
    history = [],
    model = 'gemini-2.5-flash',
    systemInstruction,
    temperature = 0.7
  } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message text is required.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Build the contents array: previous turns + new user message
    const formattedHistory = formatHistory(history);
    const contents = [
      ...formattedHistory,
      { role: 'user', parts: [{ text: message.trim() }] }
    ];

    const config = {
      temperature: Number(temperature) || 0.7
    };

    if (systemInstruction && systemInstruction.trim()) {
      config.systemInstruction = systemInstruction.trim();
    }

    const response = await ai.models.generateContent({
      model,
      contents,
      config
    });

    const reply = response.text || '';

    return res.json({
      reply,
      model,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    const errorMsg = formatErrorMessage(err);
    console.error('Gemini generateContent error:', errorMsg);
    return res.status(500).json({
      error: errorMsg
    });
  }
});

/**
 * POST /api/chat/stream
 * Handles streaming responses using Server-Sent Events (SSE)
 */
app.post('/api/chat/stream', async (req, res) => {
  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    return res.status(401).json({
      error: 'Gemini API Key missing. Please set GEMINI_API_KEY in backend/.env or pass it in settings.'
    });
  }

  const {
    message,
    history = [],
    model = 'gemini-2.5-flash',
    systemInstruction,
    temperature = 0.7
  } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message text is required.' });
  }

  // Set SSE response headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const ai = new GoogleGenAI({ apiKey });

    const formattedHistory = formatHistory(history);
    const contents = [
      ...formattedHistory,
      { role: 'user', parts: [{ text: message.trim() }] }
    ];

    const config = {
      temperature: Number(temperature) || 0.7
    };

    if (systemInstruction && systemInstruction.trim()) {
      config.systemInstruction = systemInstruction.trim();
    }

    const streamResult = await ai.models.generateContentStream({
      model,
      contents,
      config
    });

    for await (const chunk of streamResult) {
      const chunkText = chunk.text || '';
      if (chunkText) {
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    const errorMsg = formatErrorMessage(err);
    console.error('Streaming error:', errorMsg);
    res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// Fallback route to serve index.html for frontend
app.use((req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  🚀 Gemini Chatbot Backend Server running!`);
  console.log(`  🔗 Local API URL:  http://localhost:${PORT}/api`);
  console.log(`  🌐 Frontend View:  http://localhost:${PORT}`);
  console.log(`  📁 Frontend Dir:   ${frontendPath}`);
  console.log(`  🔑 Server Env Key: ${process.env.GEMINI_API_KEY ? 'Configured ✅' : 'Not set in .env (Can pass via UI) ⚠️'}`);
  console.log(`  ⚡ Supabase DB:    ${supabase ? 'Connected ✅' : 'Not configured (localStorage mode) ⚠️'}`);
  console.log(`====================================================`);
});
