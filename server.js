const express = require('express');
const path = require('path');
const app = express();

require('dotenv').config();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store: { chatId: { title, messages, updatedAt } }
const chats = {};

const SYSTEM_PROMPT = () => `You are Friday, a highly intelligent personal AI assistant — like Iron Man's J.A.R.V.I.S. but smarter and more personal. You help your user build projects, write and debug code, plan features, research topics, and think through problems. You are sharp, witty, proactive, and deeply technical. You remember the context of the conversation and always push the user toward their goals. Always address the user confidently and helpfully. Today's date is ${new Date().toDateString()}.`;

async function callGroq(messages) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages,
      temperature: 0.7,
      max_tokens: 2048
    })
  });
  const data = await response.json();
  if (!data.choices) throw new Error(JSON.stringify(data));
}

async function generateTitle(firstMessage) {
  try {
    const title = await callGroq([
      { role: 'system', content: 'Generate a short 4-6 word title for this conversation. Reply with ONLY the title, no quotes, no punctuation at end.' },
      { role: 'user', content: firstMessage }
    ]);
    return title.trim().slice(0, 50);
  } catch {
    return firstMessage.slice(0, 40);
  }
}

// Get all chats
app.get('/chats', (req, res) => {
  const list = Object.entries(chats).map(([id, chat]) => ({
    id,
    title: chat.title,
    updatedAt: chat.updatedAt
  })).sort((a, b) => b.updatedAt - a.updatedAt);
  res.json(list);
});

// Get single chat
app.get('/chats/:id', (req, res) => {
  const chat = chats[req.params.id];
  if (!chat) return res.json({ messages: [], title: 'New Chat' });
  res.json({ messages: chat.messages, title: chat.title });
});

// Create new chat
app.post('/chats/new', (req, res) => {
  const id = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  chats[id] = { title: 'New Chat', messages: [], updatedAt: Date.now() };
  res.json({ id });
});

// Delete chat
app.delete('/chats/:id', (req, res) => {
  delete chats[req.params.id];
  res.json({ ok: true });
});

// Send message
app.post('/chat', async (req, res) => {
  const { message, sessionId } = req.body;

  if (!chats[sessionId]) {
    chats[sessionId] = { title: 'New Chat', messages: [], updatedAt: Date.now() };
  }

  const chat = chats[sessionId];
  chat.messages.push({ role: 'user', content: message });
  chat.updatedAt = Date.now();

  try {
    const reply = await callGroq([
      { role: 'system', content: SYSTEM_PROMPT() },
      ...chat.messages
    ]);

    chat.messages.push({ role: 'assistant', content: reply });

    // Auto-generate title from first message
    if (chat.messages.length === 2 && chat.title === 'New Chat') {
      generateTitle(message).then(title => { chat.title = title; });
    }

    if (chat.messages.length > 50) {
      chat.messages = chat.messages.slice(-50);
    }

    res.json({ reply, title: chat.title });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🤖 Friday Agent is running!`);
  console.log(`👉 Open http://localhost:${PORT} in your browser\n`);
});
