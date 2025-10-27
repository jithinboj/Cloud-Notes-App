import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_HTTP_API || 'https://REPLACE_API';
const WS_URL = process.env.REACT_APP_WS_URL || 'wss://REPLACE_WS';

type Note = {
  noteId: string;
  userId?: string;
  title: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
};

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetchNotes();
    connectWS();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function connectWS() {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => console.log('WS connected');
    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.action === 'noteCreated') {
        setNotes((s) => [data.note, ...s]);
      } else if (data.action === 'noteUpdated') {
        setNotes((s) => s.map(n => n.noteId === data.note.noteId ? data.note : n));
      } else if (data.action === 'noteDeleted') {
        setNotes((s) => s.filter(n => n.noteId !== data.noteId));
      }
    };
    ws.onclose = () => console.log('WS closed');
    ws.onerror = (e) => console.error('WS error', e);
    wsRef.current = ws;
  }

  async function fetchNotes() {
    const res = await axios.get(`${API_BASE}/notes`);
    setNotes(res.data);
  }

  async function createNote() {
    const res = await axios.post(`${API_BASE}/notes`, { title, content });
    setTitle('');
    setContent('');
    // The server broadcasts so the WS will update UI; but also add optimistic
    setNotes((s) => [res.data, ...s]);
  }

  async function updateNote(noteId: string) {
    const note = notes.find(n => n.noteId === noteId);
    if (!note) return;
    const newTitle = prompt('Title', note.title) || note.title;
    const newContent = prompt('Content', note.content) || note.content;
    const res = await axios.put(`${API_BASE}/notes/${noteId}`, { title: newTitle, content: newContent });
    // server broadcasts update
  }

  async function deleteNote(noteId: string) {
    await axios.delete(`${API_BASE}/notes/${noteId}`);
    // server broadcasts deletion
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Cloud Notes</h1>

      <div style={{ marginBottom: 20 }}>
        <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
        <br />
        <textarea placeholder="Content" value={content} onChange={e => setContent(e.target.value)} />
        <br />
        <button onClick={createNote}>Create</button>
      </div>

      <div>
        <h2>Notes</h2>
        {notes.map(n => (
          <div key={n.noteId} style={{ border: '1px solid #ccc', padding: 10, marginBottom: 8 }}>
            <h3>{n.title}</h3>
            <p>{n.content}</p>
            <small>Updated: {n.updatedAt}</small>
            <br />
            <button onClick={() => updateNote(n.noteId)}>Edit</button>
            <button onClick={() => deleteNote(n.noteId)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
