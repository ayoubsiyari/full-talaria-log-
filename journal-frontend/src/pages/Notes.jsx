import React, { useState, useEffect, useCallback } from 'react';
import { Plus, FileText, Trash2, Save } from 'lucide-react';
import TiptapEditor from '../components/TiptapEditor';

const initialContent = '<h2>Welcome!</h2><p>This is your new note. Start writing!</p>';
const NOTE_LIMIT = 20;
const CHARACTER_LIMIT = 5000;

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [saveStatus, setSaveStatus] = useState('Saved');

  const handleNewNote = useCallback(() => {
    if (notes.length >= NOTE_LIMIT) return;
    const newNote = {
      id: Date.now(),
      title: `Note ${notes.length + 1}`,
      content: initialContent,
    };
    setNotes(prevNotes => [...prevNotes, newNote]);
    setActiveNoteId(newNote.id);
  }, [notes.length]);

  useEffect(() => {
    const savedNotes = localStorage.getItem('notes');
    if (savedNotes) {
      const parsedNotes = JSON.parse(savedNotes);
      if (parsedNotes.length > 0) {
        setNotes(parsedNotes);
        setActiveNoteId(parsedNotes[0].id);
      } else {
        handleNewNote();
      }
    } else {
      handleNewNote();
    }
  }, [handleNewNote]);

  useEffect(() => {
    if (saveStatus === 'Unsaved changes') return;
    const handler = setTimeout(() => {
      if (notes.length > 0) {
        localStorage.setItem('notes', JSON.stringify(notes));
        setSaveStatus('Saved');
      }
    }, 1500);
    return () => clearTimeout(handler);
  }, [notes, saveStatus]);

  const handleDeleteNote = (id) => {
    const filteredNotes = notes.filter(note => note.id !== id);
    setNotes(filteredNotes);
    if (activeNoteId === id) {
      setActiveNoteId(filteredNotes.length > 0 ? filteredNotes[0].id : null);
    }
  };

  const handleNoteUpdate = (updates) => {
    setSaveStatus('Unsaved changes');
    setNotes(notes.map(note => 
      note.id === activeNoteId ? { ...note, ...updates } : note
    ));
  };
  
  const triggerSave = () => {
    setSaveStatus('Saving...');
    localStorage.setItem('notes', JSON.stringify(notes));
    setTimeout(() => setSaveStatus('Saved'), 500);
  };

  const activeNote = notes.find(note => note.id === activeNoteId);
  const isNoteLimitReached = notes.length >= NOTE_LIMIT;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex h-screen">
      <aside className="w-72 bg-[#121212] p-4 border-r border-gray-700/50 flex flex-col">
        <header className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-xl font-bold">My Notes ({notes.length}/{NOTE_LIMIT})</h2>
          <button 
            onClick={handleNewNote} 
            className="p-2 rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={isNoteLimitReached ? 'Note limit reached' : 'New Note'}
            disabled={isNoteLimitReached}
          >
            <Plus size={20} />
          </button>
        </header>
        <div className="flex-grow overflow-y-auto pr-2">
          {notes.map(note => (
            <div key={note.id} onClick={() => setActiveNoteId(note.id)} className={`flex items-center justify-between p-3 rounded-lg cursor-pointer mb-2 transition-colors ${activeNoteId === note.id ? 'bg-blue-600/30' : 'hover:bg-gray-800'}`}>
              <div className="flex items-center gap-3">
                <FileText size={18} />
                <span className="truncate font-medium">{note.title}</span>
              </div>
              <button onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }} className="p-1 rounded-md hover:bg-red-500/50 opacity-50 hover:opacity-100 transition-opacity" title="Delete Note">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <main className="flex-grow p-6 flex flex-col">
        {activeNote ? (
          <div className="flex flex-col h-full">
            <div className="flex-shrink-0 flex items-center justify-between mb-4">
              <input 
                type="text"
                value={activeNote.title}
                onChange={(e) => handleNoteUpdate({ title: e.target.value })}
                className="text-2xl font-bold bg-transparent border-b-2 border-transparent focus:border-blue-500 focus:outline-none transition-colors w-full"
              />
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-400 italic w-28 text-right">{saveStatus}</span>
                <button onClick={triggerSave} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-500 transition-colors" disabled={saveStatus !== 'Unsaved changes'}>
                  <Save size={16} />
                  Save
                </button>
              </div>
            </div>
            <div className="flex-grow h-full overflow-y-auto">
              <TiptapEditor 
                key={activeNote.id}
                content={activeNote.content} 
                onUpdate={(content) => handleNoteUpdate({ content })}
                limit={CHARACTER_LIMIT}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <FileText size={48} />
            <p className="mt-4 text-lg">No note selected</p>
            <p>Create a new note or select one from the list.</p>
          </div>
        )}
      </main>
    </div>
  );
}
