const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Database setup
const db = new sqlite3.Database('./chart_data.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('✅ Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    db.run(`
        CREATE TABLE IF NOT EXISTS csv_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            row_count INTEGER,
            description TEXT
        )
    `, (err) => {
        if (err) console.error('Error creating table:', err);
        else console.log('✅ Database table ready');
    });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed!'), false);
        }
    }
});

// API Routes

// Upload CSV file
app.post('/api/upload', upload.single('csvFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const { filename, originalname } = req.file;
    const description = req.body.description || '';

    // Count rows in CSV
    const filePath = path.join(__dirname, 'uploads', filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    const rowCount = content.split('\n').length - 1; // Exclude header

    // Save to database
    const sql = `INSERT INTO csv_files (filename, original_name, row_count, description) VALUES (?, ?, ?, ?)`;
    
    db.run(sql, [filename, originalname, rowCount, description], function(err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to save file info' });
        }

        res.json({
            success: true,
            file: {
                id: this.lastID,
                filename: originalname,
                rowCount: rowCount,
                uploadDate: new Date().toISOString()
            }
        });
    });
});

// Get list of all CSV files
app.get('/api/files', (req, res) => {
    const sql = `SELECT id, original_name, upload_date, row_count, description FROM csv_files ORDER BY upload_date DESC`;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to fetch files' });
        }
        res.json({ files: rows });
    });
});

// Get specific CSV file data
app.get('/api/file/:id', (req, res) => {
    const fileId = req.params.id;
    
    const sql = `SELECT filename FROM csv_files WHERE id = ?`;
    
    db.get(sql, [fileId], (err, row) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!row) {
            return res.status(404).json({ error: 'File not found' });
        }

        const filePath = path.join(__dirname, 'uploads', row.filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on disk' });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        res.json({ data: content });
    });
});

// Delete CSV file
app.delete('/api/file/:id', (req, res) => {
    const fileId = req.params.id;
    
    const sql = `SELECT filename FROM csv_files WHERE id = ?`;
    
    db.get(sql, [fileId], (err, row) => {
        if (err || !row) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Delete from disk
        const filePath = path.join(__dirname, 'uploads', row.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Delete from database
        db.run(`DELETE FROM csv_files WHERE id = ?`, [fileId], (err) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to delete file' });
            }
            res.json({ success: true });
        });
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Chart available at http://localhost:${PORT}/index.html`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) console.error(err);
        console.log('\n👋 Database connection closed');
        process.exit(0);
    });
});