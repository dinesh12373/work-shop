/**
 * Gemini AI Chatbot - Client Application Logic
 * Communicates with the decoupled Node.js backend.
 */

// Preset system instructions
const PERSONA_PROMPTS = {
  helpful: "You are a helpful, brilliant, and friendly AI assistant powered by Google Gemini. Provide insightful, well-structured, and accurate responses.",
  coder: "You are an elite Senior Software Architect. Write clean, production-grade, well-commented code. Always explain your technical decisions and mention edge cases or performance considerations.",
  concise: "You are an ultra-fast, direct explainer. Give brief, punchy, high-signal answers without fluff or preamble.",
  creative: "You are an imaginative creative thinker, storyteller, and innovator. Bring vivid metaphors, inspiring ideas, and novel angles to every topic."
};

class GeminiChatbot {
  constructor() {
    // Storage keys
    this.STORAGE_KEY_SESSIONS = 'gemini_chat_sessions';
    this.STORAGE_KEY_SETTINGS = 'gemini_chat_settings';

    // State
    this.settings = this.loadSettings();
    this.sessions = this.loadSessions();
    this.currentChatId = null;
    this.isGenerating = false;
    this.recognition = null;
    this.isRecording = false;
    this.supabaseClient = null;

    // Cache DOM Elements
    this.initDOMElements();

    // Setup Markdown parser with Highlight.js
    this.initMarkdown();

    // Event Listeners
    this.bindEvents();

    // Initialize Active Chat
    this.initSession();

    // Check Backend Connection & Load Env/Supabase Config
    this.checkBackendHealth();
    this.loadConfigAndInitSupabase();
  }

  /* ==========================================================================
     State & Persistence
     ========================================================================== */
  loadSettings() {
    const defaultBackend = (window.location.origin.includes('localhost:5000') || window.location.origin.includes('127.0.0.1:5000'))
      ? ''
      : 'http://localhost:5000';

    const saved = localStorage.getItem(this.STORAGE_KEY_SETTINGS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          backendUrl: parsed.backendUrl || defaultBackend,
          apiKey: parsed.apiKey || '',
          supabaseUrl: parsed.supabaseUrl || '',
          supabaseAnonKey: parsed.supabaseAnonKey || '',
          model: parsed.model || 'gemini-2.5-flash',
          temperature: parsed.temperature ?? 0.7,
          systemInstruction: parsed.systemInstruction || PERSONA_PROMPTS.helpful
        };
      } catch (e) {
        console.error('Failed to parse saved settings:', e);
      }
    }
    return {
      backendUrl: defaultBackend,
      apiKey: '',
      supabaseUrl: '',
      supabaseAnonKey: '',
      model: 'gemini-2.5-flash',
      temperature: 0.7,
      systemInstruction: PERSONA_PROMPTS.helpful
    };
  }

  saveSettings() {
    localStorage.setItem(this.STORAGE_KEY_SETTINGS, JSON.stringify(this.settings));
  }

  loadSessions() {
    const saved = localStorage.getItem(this.STORAGE_KEY_SESSIONS);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse chat sessions:', e);
      }
    }
    return [];
  }

  saveSessions(syncRemote = true) {
    localStorage.setItem(this.STORAGE_KEY_SESSIONS, JSON.stringify(this.sessions));
    this.renderHistoryList();
    if (syncRemote) {
      const current = this.getCurrentSession();
      if (current) this.persistSessionToSupabase(current);
    }
  }

  /* ==========================================================================
     DOM & Initialization
     ========================================================================== */
  initDOMElements() {
    // Nav & Sidebar
    this.sidebar = document.getElementById('sidebar');
    this.sidebarBackdrop = document.getElementById('sidebar-backdrop');
    this.btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    this.btnNewChat = document.getElementById('btn-new-chat');
    this.chatHistoryList = document.getElementById('chat-history-list');
    this.personaSelect = document.getElementById('persona-select');
    this.backendStatusDot = document.getElementById('backend-status-dot');
    this.backendStatusText = document.getElementById('backend-status-text');
    this.keyStatusText = document.getElementById('key-status-text');
    this.supabaseStatusText = document.getElementById('supabase-status-text');
    this.modelSelect = document.getElementById('model-select');
    this.btnClearChat = document.getElementById('btn-clear-chat');
    this.btnOpenSettings = document.getElementById('btn-open-settings');

    // Chat Viewport & Input
    this.chatViewport = document.getElementById('chat-viewport');
    this.welcomeHero = document.getElementById('welcome-hero');
    this.messagesList = document.getElementById('messages-list');
    this.chatTextarea = document.getElementById('chat-textarea');
    this.btnSend = document.getElementById('btn-send');
    this.btnSpeech = document.getElementById('btn-speech');
    this.backendUrlLabel = document.getElementById('backend-url-label');

    // Settings Modal
    this.settingsModal = document.getElementById('settings-modal');
    this.btnCloseModal = document.getElementById('btn-close-modal');
    this.inputApiKey = document.getElementById('input-api-key');
    this.btnToggleKeyVisibility = document.getElementById('btn-toggle-key-visibility');
    this.inputBackendUrl = document.getElementById('input-backend-url');
    this.inputSupabaseUrl = document.getElementById('input-supabase-url');
    this.inputSupabaseKey = document.getElementById('input-supabase-key');
    this.btnToggleSupabaseKey = document.getElementById('btn-toggle-supabase-key');
    this.sliderTemperature = document.getElementById('slider-temperature');
    this.valTemperature = document.getElementById('val-temperature');
    this.inputSystemPrompt = document.getElementById('input-system-prompt');
    this.btnTestSupabase = document.getElementById('btn-test-supabase');
    this.btnTestConnection = document.getElementById('btn-test-connection');
    this.btnSaveSettings = document.getElementById('btn-save-settings');
    this.testResultBox = document.getElementById('test-result-box');

    // Toast
    this.toast = document.getElementById('toast');

    // Populate initial inputs from settings
    this.modelSelect.value = this.settings.model;
    this.inputApiKey.value = this.settings.apiKey;
    this.inputBackendUrl.value = this.settings.backendUrl || 'http://localhost:5000';
    this.inputSupabaseUrl.value = this.settings.supabaseUrl || '';
    this.inputSupabaseKey.value = this.settings.supabaseAnonKey || '';
    this.sliderTemperature.value = this.settings.temperature;
    this.valTemperature.textContent = this.settings.temperature;
    this.inputSystemPrompt.value = this.settings.systemInstruction;
    this.backendUrlLabel.textContent = this.settings.backendUrl || window.location.origin;
  }

  initMarkdown() {
    if (typeof marked !== 'undefined') {
      const renderer = new marked.Renderer();

      // Custom code block renderer with copy button
      renderer.code = function({ text, lang }) {
        const language = lang || 'text';
        let highlighted = text;
        if (typeof hljs !== 'undefined' && hljs.getLanguage(language)) {
          try {
            highlighted = hljs.highlight(text, { language }).value;
          } catch (e) {
            highlighted = text;
          }
        }
        return `
          <div class="code-block-container">
            <div class="code-block-header">
              <span>${language}</span>
              <button class="btn-copy-code" onclick="window.geminiApp.copyTextToClipboard(decodeURIComponent('${encodeURIComponent(text)}'), this)">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>Copy</span>
              </button>
            </div>
            <pre><code class="hljs ${language}">${highlighted}</code></pre>
          </div>
        `;
      };

      marked.setOptions({
        renderer,
        gfm: true,
        breaks: true
      });
    }
  }

  /* ==========================================================================
     Event Binding
     ========================================================================== */
  bindEvents() {
    // Expose app instance globally for code copy handlers
    window.geminiApp = this;

    // Send on button click
    this.btnSend.addEventListener('click', () => this.handleSendMessage());

    // Send on Enter (Shift+Enter for newline)
    this.chatTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSendMessage();
      }
    });

    // Auto-grow textarea
    this.chatTextarea.addEventListener('input', () => {
      this.chatTextarea.style.height = 'auto';
      this.chatTextarea.style.height = Math.min(this.chatTextarea.scrollHeight, 160) + 'px';
    });

    // Suggestion Cards
    document.querySelectorAll('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const prompt = card.getAttribute('data-prompt');
        if (prompt) {
          this.chatTextarea.value = prompt;
          this.handleSendMessage();
        }
      });
    });

    // New Chat
    this.btnNewChat.addEventListener('click', () => this.createNewSession());

    // Clear Chat
    this.btnClearChat.addEventListener('click', () => this.clearCurrentChat());

    // Model Change
    this.modelSelect.addEventListener('change', (e) => {
      this.settings.model = e.target.value;
      this.saveSettings();
      this.showToast(`Switched model to ${e.target.value}`);
    });

    // Persona Change
    this.personaSelect.addEventListener('change', (e) => {
      const preset = PERSONA_PROMPTS[e.target.value];
      if (preset) {
        this.settings.systemInstruction = preset;
        this.inputSystemPrompt.value = preset;
        this.saveSettings();
        this.showToast(`Persona updated to ${e.target.options[e.target.selectedIndex].text}`);
      }
    });

    // Settings Modal Open/Close
    this.btnOpenSettings.addEventListener('click', () => this.openSettingsModal());
    this.btnCloseModal.addEventListener('click', () => this.closeSettingsModal());
    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) this.closeSettingsModal();
    });

    // Toggle API Key visibility
    this.btnToggleKeyVisibility.addEventListener('click', () => {
      if (this.inputApiKey.type === 'password') {
        this.inputApiKey.type = 'text';
        this.btnToggleKeyVisibility.textContent = 'Hide';
      } else {
        this.inputApiKey.type = 'password';
        this.btnToggleKeyVisibility.textContent = 'Show';
      }
    });

    // Toggle Supabase Key visibility
    this.btnToggleSupabaseKey.addEventListener('click', () => {
      if (this.inputSupabaseKey.type === 'password') {
        this.inputSupabaseKey.type = 'text';
        this.btnToggleSupabaseKey.textContent = 'Hide';
      } else {
        this.inputSupabaseKey.type = 'password';
        this.btnToggleSupabaseKey.textContent = 'Show';
      }
    });

    // Slider input change
    this.sliderTemperature.addEventListener('input', (e) => {
      this.valTemperature.textContent = e.target.value;
    });

    // Save Settings
    this.btnSaveSettings.addEventListener('click', () => {
      this.settings.apiKey = this.inputApiKey.value.trim();
      this.settings.backendUrl = this.inputBackendUrl.value.trim().replace(/\/+$/, '');
      this.settings.supabaseUrl = this.inputSupabaseUrl.value.trim();
      this.settings.supabaseAnonKey = this.inputSupabaseKey.value.trim();
      this.settings.temperature = parseFloat(this.sliderTemperature.value) || 0.7;
      this.settings.systemInstruction = this.inputSystemPrompt.value.trim();
      this.saveSettings();
      this.backendUrlLabel.textContent = this.settings.backendUrl || window.location.origin;
      this.initSupabaseClient();
      this.closeSettingsModal();
      this.showToast('Settings saved successfully!');
      this.checkBackendHealth();
    });

    // Test Gemini Connection
    this.btnTestConnection.addEventListener('click', () => this.testConnection());

    // Test Supabase Connection
    this.btnTestSupabase.addEventListener('click', () => this.testSupabaseConnection());

    // Mobile Sidebar Toggle
    this.btnToggleSidebar.addEventListener('click', () => {
      this.sidebar.classList.toggle('open');
      this.sidebarBackdrop.classList.toggle('show');
    });

    this.sidebarBackdrop.addEventListener('click', () => {
      this.sidebar.classList.remove('open');
      this.sidebarBackdrop.classList.remove('show');
    });

    // Voice Dictation
    this.setupSpeechRecognition();
  }

  /* ==========================================================================
     Session & History Management
     ========================================================================== */
  initSession() {
    if (this.sessions.length > 0) {
      this.currentChatId = this.sessions[0].id;
    } else {
      this.createNewSession(false);
    }
    this.renderCurrentChat();
    this.renderHistoryList();
  }

  getCurrentSession() {
    return this.sessions.find(s => s.id === this.currentChatId);
  }

  createNewSession(shouldFocus = true) {
    const newSession = {
      id: 'session_' + Date.now(),
      title: 'New Conversation',
      messages: [],
      createdAt: new Date().toISOString()
    };

    this.sessions.unshift(newSession);
    this.currentChatId = newSession.id;
    this.saveSessions();
    this.renderCurrentChat();

    // Close mobile drawer if open
    this.sidebar.classList.remove('open');
    this.sidebarBackdrop.classList.remove('show');

    if (shouldFocus) {
      this.chatTextarea.focus();
    }
  }

  switchSession(id) {
    if (this.isGenerating) {
      this.showToast('Please wait for the current response to finish.');
      return;
    }
    this.currentChatId = id;
    this.renderCurrentChat();
    this.renderHistoryList();

    // Close mobile drawer
    this.sidebar.classList.remove('open');
    this.sidebarBackdrop.classList.remove('show');
  }

  deleteSession(id, e) {
    e.stopPropagation();
    this.deleteSessionFromSupabase(id);
    this.sessions = this.sessions.filter(s => s.id !== id);
    if (this.currentChatId === id) {
      if (this.sessions.length > 0) {
        this.currentChatId = this.sessions[0].id;
      } else {
        this.createNewSession(false);
        return;
      }
    }
    this.saveSessions(false);
    this.renderCurrentChat();
  }

  clearCurrentChat() {
    const session = this.getCurrentSession();
    if (!session || session.messages.length === 0) return;

    if (confirm('Are you sure you want to clear this conversation?')) {
      session.messages = [];
      session.title = 'New Conversation';
      this.saveSessions();
      this.renderCurrentChat();
      this.showToast('Conversation cleared.');
    }
  }

  renderHistoryList() {
    this.chatHistoryList.innerHTML = '';
    this.sessions.forEach(session => {
      const item = document.createElement('div');
      item.className = `history-item ${session.id === this.currentChatId ? 'active' : ''}`;
      item.innerHTML = `
        <span class="history-title" title="${this.escapeHtml(session.title)}">${this.escapeHtml(session.title)}</span>
        <button class="btn-delete-history" title="Delete conversation">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      `;

      item.addEventListener('click', () => this.switchSession(session.id));
      item.querySelector('.btn-delete-history').addEventListener('click', (e) => this.deleteSession(session.id, e));

      this.chatHistoryList.appendChild(item);
    });
  }

  renderCurrentChat() {
    const session = this.getCurrentSession();
    if (!session || session.messages.length === 0) {
      this.welcomeHero.style.display = 'block';
      this.messagesList.innerHTML = '';
    } else {
      this.welcomeHero.style.display = 'none';
      this.messagesList.innerHTML = '';
      session.messages.forEach(msg => {
        this.appendMessageElement(msg.role, msg.content, msg.timestamp, false);
      });
      this.scrollToBottom();
    }
  }

  /* ==========================================================================
     Backend Health & Connectivity
     ========================================================================== */
  async checkBackendHealth() {
    const base = this.settings.backendUrl || '';
    const url = `${base}/api/health`;

    this.backendStatusText.textContent = 'Connecting...';
    this.backendStatusDot.className = 'status-dot';

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      this.backendStatusDot.className = 'status-dot connected';
      this.backendStatusText.textContent = 'Backend Connected';

      if (data.hasEnvKey) {
        this.keyStatusText.textContent = '🔑 Server Key: Active';
        this.keyStatusText.style.color = 'var(--accent-cyan)';
      } else if (this.settings.apiKey) {
        this.keyStatusText.textContent = '🔑 Client Key: Active';
        this.keyStatusText.style.color = 'var(--accent-cyan)';
      } else {
        this.keyStatusText.textContent = '⚠️ API Key Needed';
        this.keyStatusText.style.color = 'var(--warning)';
      }

      if (data.hasSupabase || data.supabaseConnected || this.supabaseClient) {
        this.updateSupabaseStatus(true);
      } else {
        this.updateSupabaseStatus(false);
      }
    } catch (err) {
      console.warn('Backend connection error:', err);
      this.backendStatusDot.className = 'status-dot disconnected';
      this.backendStatusText.textContent = 'Backend Offline';
      this.keyStatusText.textContent = 'Run: npm start in backend';
      this.keyStatusText.style.color = 'var(--danger)';
      this.updateSupabaseStatus(Boolean(this.supabaseClient));
    }
  }

  async testConnection() {
    this.testResultBox.style.display = 'block';
    this.testResultBox.className = 'test-result-box';
    this.testResultBox.textContent = 'Testing connection with Gemini API...';

    const base = this.inputBackendUrl.value.trim().replace(/\/+$/, '');
    const apiKey = this.inputApiKey.value.trim();

    try {
      const res = await fetch(`${base}/api/test-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({ apiKey })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        this.testResultBox.className = 'test-result-box success';
        this.testResultBox.textContent = `✅ Success! Backend responded: "${data.reply}"`;
      } else {
        this.testResultBox.className = 'test-result-box error';
        this.testResultBox.textContent = `❌ ${data.error || 'Failed to authenticate.'}`;
      }
    } catch (err) {
      this.testResultBox.className = 'test-result-box error';
      this.testResultBox.textContent = `❌ Cannot reach backend at ${base}. Make sure backend server is running.`;
    }
  }

  /* ==========================================================================
     Supabase Database Integration & Config
     ========================================================================== */
  async loadConfigAndInitSupabase() {
    const base = this.settings.backendUrl || '';
    try {
      const res = await fetch(`${base}/api/config`);
      if (res.ok) {
        const config = await res.json();
        if (config.supabaseUrl && !this.settings.supabaseUrl) {
          this.settings.supabaseUrl = config.supabaseUrl;
          this.inputSupabaseUrl.value = config.supabaseUrl;
        }
        if (config.supabaseAnonKey && !this.settings.supabaseAnonKey) {
          this.settings.supabaseAnonKey = config.supabaseAnonKey;
          this.inputSupabaseKey.value = config.supabaseAnonKey;
        }
        if (config.defaultModel && !this.settings.model) {
          this.settings.model = config.defaultModel;
          this.modelSelect.value = config.defaultModel;
        }
      }
    } catch (e) {
      await this.tryLoadLocalEnv();
    }

    this.initSupabaseClient();
    await this.syncConversationsFromSupabase();
  }

  async tryLoadLocalEnv() {
    try {
      const res = await fetch('./.env');
      if (res.ok) {
        const text = await res.text();
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const [key, ...valParts] = trimmed.split('=');
          const val = valParts.join('=').trim();
          if (key.trim() === 'SUPABASE_URL' && val && !this.settings.supabaseUrl) {
            this.settings.supabaseUrl = val;
            this.inputSupabaseUrl.value = val;
          }
          if (key.trim() === 'SUPABASE_ANON_KEY' && val && !this.settings.supabaseAnonKey) {
            this.settings.supabaseAnonKey = val;
            this.inputSupabaseKey.value = val;
          }
          if (key.trim() === 'BACKEND_URL' && val) {
            this.settings.backendUrl = val;
          }
        }
      }
    } catch (err) {
      // Ignore static fetch failure
    }
  }

  initSupabaseClient() {
    const url = this.settings.supabaseUrl;
    const key = this.settings.supabaseAnonKey;
    if (window.supabase && url && key) {
      try {
        this.supabaseClient = window.supabase.createClient(url, key);
        this.updateSupabaseStatus(true);
        console.log('⚡ Supabase Client initialized in browser');
      } catch (err) {
        console.warn('Supabase client error:', err);
        this.updateSupabaseStatus(false);
      }
    } else {
      this.updateSupabaseStatus(false);
    }
  }

  updateSupabaseStatus(isConnected) {
    if (this.supabaseStatusText) {
      if (isConnected) {
        this.supabaseStatusText.textContent = '⚡ Supabase: Cloud Sync Active';
        this.supabaseStatusText.style.color = 'var(--accent-cyan)';
      } else {
        this.supabaseStatusText.textContent = '⚡ Supabase: Local Mode';
        this.supabaseStatusText.style.color = 'var(--text-muted)';
      }
    }
  }

  async syncConversationsFromSupabase() {
    const base = this.settings.backendUrl || '';
    try {
      const res = await fetch(`${base}/api/conversations`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.conversations) && data.conversations.length > 0) {
          this.sessions = data.conversations;
          this.saveSessions(false);
          if (!this.currentChatId || !this.sessions.some(s => s.id === this.currentChatId)) {
            this.currentChatId = this.sessions[0].id;
          }
          this.renderCurrentChat();
          this.renderHistoryList();
          this.updateSupabaseStatus(true);
        }
      }
    } catch (err) {
      console.warn('Could not sync with Supabase backend:', err);
    }
  }

  async persistSessionToSupabase(session) {
    const base = this.settings.backendUrl || '';
    try {
      await fetch(`${base}/api/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session)
      });
    } catch (err) {
      console.warn('Failed to persist to Supabase:', err);
    }
  }

  async deleteSessionFromSupabase(id) {
    const base = this.settings.backendUrl || '';
    try {
      await fetch(`${base}/api/conversations/${id}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.warn('Failed to delete from Supabase:', err);
    }
  }

  async testSupabaseConnection() {
    this.testResultBox.style.display = 'block';
    this.testResultBox.className = 'test-result-box';
    this.testResultBox.textContent = 'Testing Supabase database connection...';

    const base = this.inputBackendUrl.value.trim().replace(/\/+$/, '');
    const supabaseUrl = this.inputSupabaseUrl.value.trim();
    const supabaseKey = this.inputSupabaseKey.value.trim();

    try {
      const res = await fetch(`${base}/api/test-supabase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseUrl, supabaseKey })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        this.testResultBox.className = 'test-result-box success';
        this.testResultBox.textContent = `✅ ${data.message}`;
      } else {
        this.testResultBox.className = 'test-result-box error';
        this.testResultBox.textContent = `❌ ${data.error || 'Failed to connect to Supabase.'}`;
      }
    } catch (err) {
      this.testResultBox.className = 'test-result-box error';
      this.testResultBox.textContent = `❌ Cannot reach backend at ${base}. Make sure backend server is running.`;
    }
  }

  /* ==========================================================================
     Send Message & Streaming
     ========================================================================== */
  async handleSendMessage() {
    const text = this.chatTextarea.value.trim();
    if (!text || this.isGenerating) return;

    const session = this.getCurrentSession();
    if (!session) return;

    // Reset textarea
    this.chatTextarea.value = '';
    this.chatTextarea.style.height = 'auto';

    // Hide welcome hero
    this.welcomeHero.style.display = 'none';

    // Add user message
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    session.messages.push({ role: 'user', content: text, timestamp: now });

    // Auto title for the first message
    if (session.messages.length === 1) {
      session.title = text.length > 36 ? text.substring(0, 36) + '...' : text;
    }
    this.saveSessions();

    // Render User Bubble
    this.appendMessageElement('user', text, now, true);

    // Create Assistant Bubble with Typing Indicator
    const assistantBubble = this.createAssistantPlaceholder();
    this.isGenerating = true;
    this.btnSend.disabled = true;

    // Prepare history payload (Gemini accepts role: user / model)
    const historyPayload = session.messages.slice(0, -1).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      content: m.content
    }));

    const base = this.settings.backendUrl || '';
    const headers = { 'Content-Type': 'application/json' };
    if (this.settings.apiKey) {
      headers['x-api-key'] = this.settings.apiKey;
    }

    let fullReply = '';

    try {
      // Attempt Streaming Request
      const streamRes = await fetch(`${base}/api/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: text,
          history: historyPayload,
          model: this.settings.model,
          systemInstruction: this.settings.systemInstruction,
          temperature: this.settings.temperature
        })
      });

      if (!streamRes.ok) {
        // Fallback to non-streaming if stream endpoint returned error status
        const errorData = await streamRes.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${streamRes.status}`);
      }

      // Read SSE Stream
      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.replace('data: ', '').trim();
            if (dataStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.text) {
                fullReply += parsed.text;
                this.updateAssistantBubble(assistantBubble, fullReply);
              }
            } catch (err) {
              if (err.message && !err.message.includes('JSON')) {
                throw err;
              }
            }
          }
        }
      }

      // If fullReply is still empty, fall back to standard POST /api/chat
      if (!fullReply.trim()) {
        const standardRes = await fetch(`${base}/api/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: text,
            history: historyPayload,
            model: this.settings.model,
            systemInstruction: this.settings.systemInstruction,
            temperature: this.settings.temperature
          })
        });

        const standardData = await standardRes.json();
        if (!standardRes.ok) throw new Error(standardData.error || 'Server error');
        fullReply = standardData.reply;
        this.updateAssistantBubble(assistantBubble, fullReply);
      }

      // Complete assistant bubble with actions
      const replyTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.finalizeAssistantBubble(assistantBubble, fullReply, replyTime);

      // Save to session
      session.messages.push({ role: 'assistant', content: fullReply, timestamp: replyTime });
      this.saveSessions();
    } catch (err) {
      console.error('Chat error:', err);
      const errMsg = `⚠️ **Error:** ${err.message}\n\n*Make sure your Gemini API key is configured and backend server is running on \`${base || 'http://localhost:5000'}\`.*`;
      this.finalizeAssistantBubble(assistantBubble, errMsg, 'Error');
    } finally {
      this.isGenerating = false;
      this.btnSend.disabled = false;
      this.chatTextarea.focus();
    }
  }

  /* ==========================================================================
     UI Rendering Helpers
     ========================================================================== */
  appendMessageElement(role, content, timestamp, shouldScroll = true) {
    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    const avatarHtml = role === 'user'
      ? `<div class="avatar user-avatar">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>`
      : `<div class="avatar ai-avatar">
          <svg viewBox="0 0 24 24" fill="none" style="width:20px;height:20px;">
            <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="white" />
          </svg>
        </div>`;

    const formattedContent = role === 'assistant'
      ? this.renderMarkdown(content)
      : `<p>${this.escapeHtml(content).replace(/\n/g, '<br>')}</p>`;

    const actionsHtml = role === 'assistant'
      ? `<div class="message-actions">
          <button class="btn-action-small" onclick="window.geminiApp.copyTextToClipboard(decodeURIComponent('${encodeURIComponent(content)}'), this)" title="Copy message">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy</span>
          </button>
          <button class="btn-action-small" onclick="window.geminiApp.speakText(decodeURIComponent('${encodeURIComponent(content)}'))" title="Read aloud">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            <span>Listen</span>
          </button>
        </div>`
      : '';

    row.innerHTML = `
      ${avatarHtml}
      <div class="message-bubble-wrapper">
        <div class="message-bubble">${formattedContent}</div>
        <div class="message-footer">
          <span>${timestamp}</span>
          ${actionsHtml}
        </div>
      </div>
    `;

    this.messagesList.appendChild(row);
    if (shouldScroll) this.scrollToBottom();
  }

  createAssistantPlaceholder() {
    const row = document.createElement('div');
    row.className = 'message-row assistant';
    row.innerHTML = `
      <div class="avatar ai-avatar">
        <svg viewBox="0 0 24 24" fill="none" style="width:20px;height:20px;">
          <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="white" />
        </svg>
      </div>
      <div class="message-bubble-wrapper">
        <div class="message-bubble">
          <div class="typing-indicator">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
          </div>
        </div>
        <div class="message-footer">
          <span>Generating response...</span>
        </div>
      </div>
    `;

    this.messagesList.appendChild(row);
    this.scrollToBottom();
    return row;
  }

  updateAssistantBubble(rowElement, currentMarkdown) {
    const bubble = rowElement.querySelector('.message-bubble');
    if (bubble) {
      bubble.innerHTML = this.renderMarkdown(currentMarkdown);
      this.scrollToBottom();
    }
  }

  finalizeAssistantBubble(rowElement, finalContent, timestamp) {
    const bubble = rowElement.querySelector('.message-bubble');
    const footer = rowElement.querySelector('.message-footer');

    if (bubble) {
      bubble.innerHTML = this.renderMarkdown(finalContent);
    }

    if (footer) {
      footer.innerHTML = `
        <span>${timestamp}</span>
        <div class="message-actions">
          <button class="btn-action-small" onclick="window.geminiApp.copyTextToClipboard(decodeURIComponent('${encodeURIComponent(finalContent)}'), this)" title="Copy message">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy</span>
          </button>
          <button class="btn-action-small" onclick="window.geminiApp.speakText(decodeURIComponent('${encodeURIComponent(finalContent)}'))" title="Read aloud">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            <span>Listen</span>
          </button>
        </div>
      `;
    }
    this.scrollToBottom();
  }

  renderMarkdown(content) {
    if (typeof marked !== 'undefined') {
      try {
        return marked.parse(content);
      } catch (e) {
        console.error('Markdown parsing error:', e);
      }
    }
    return `<p>${this.escapeHtml(content).replace(/\n/g, '<br>')}</p>`;
  }

  scrollToBottom() {
    this.chatViewport.scrollTop = this.chatViewport.scrollHeight;
  }

  /* ==========================================================================
     Voice & Audio (Web Speech API)
     ========================================================================== */
  setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.btnSpeech.style.display = 'none';
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isRecording = true;
      this.btnSpeech.classList.add('recording');
      this.showToast('Listening... Speak into your microphone.');
    };

    this.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      this.chatTextarea.value = (this.chatTextarea.value ? this.chatTextarea.value + ' ' : '') + transcript;
      this.chatTextarea.style.height = Math.min(this.chatTextarea.scrollHeight, 160) + 'px';
      this.chatTextarea.focus();
    };

    this.recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      this.showToast(`Speech recognition: ${event.error}`);
    };

    this.recognition.onend = () => {
      this.isRecording = false;
      this.btnSpeech.classList.remove('recording');
    };

    this.btnSpeech.addEventListener('click', () => {
      if (this.isRecording) {
        this.recognition.stop();
      } else {
        this.recognition.start();
      }
    });
  }

  speakText(text) {
    if (!('speechSynthesis' in window)) {
      this.showToast('Text-to-speech is not supported in this browser.');
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      this.showToast('Audio playback stopped.');
      return;
    }

    // Strip code blocks and raw markdown for natural speech
    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_#\[\]]/g, '')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
    this.showToast('Playing audio (click Listen again to stop)...');
  }

  /* ==========================================================================
     Clipboard & Notifications
     ========================================================================== */
  async copyTextToClipboard(text, btnElement) {
    try {
      await navigator.clipboard.writeText(text);
      if (btnElement) {
        const originalText = btnElement.innerHTML;
        btnElement.innerHTML = `
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Copied!</span>
        `;
        setTimeout(() => {
          btnElement.innerHTML = originalText;
        }, 2000);
      }
      this.showToast('Copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
      this.showToast('Failed to copy to clipboard.');
    }
  }

  showToast(message, duration = 3000) {
    this.toast.textContent = message;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toast.classList.remove('show');
    }, duration);
  }

  /* ==========================================================================
     Modal Helpers
     ========================================================================== */
  openSettingsModal() {
    this.inputApiKey.value = this.settings.apiKey;
    this.inputBackendUrl.value = this.settings.backendUrl || 'http://localhost:5000';
    this.inputSupabaseUrl.value = this.settings.supabaseUrl || '';
    this.inputSupabaseKey.value = this.settings.supabaseAnonKey || '';
    this.sliderTemperature.value = this.settings.temperature;
    this.valTemperature.textContent = this.settings.temperature;
    this.inputSystemPrompt.value = this.settings.systemInstruction;
    this.testResultBox.style.display = 'none';
    this.settingsModal.style.display = 'flex';
  }

  closeSettingsModal() {
    this.settingsModal.style.display = 'none';
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Instantiate on DOM load
document.addEventListener('DOMContentLoaded', () => {
  window.chatbot = new GeminiChatbot();
});
