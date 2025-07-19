const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'database.sqlite');

// Configure middleware with increased limits
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Add error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ error: 'Invalid JSON' });
    }
    next(err);
});

// Create database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    db.serialize(() => {
        // Create students table
        db.run(`CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            package TEXT,
            start_date TEXT,
            end_date TEXT,
            amount REAL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating students table:', err);
            } else {
                console.log('Students table created successfully');
            }
        });

        // Create payments table
        db.run(`CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            amount REAL NOT NULL,
            payment_date TEXT NOT NULL,
            payment_method TEXT,
            notes TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students (id)
        )`, (err) => {
            if (err) {
                console.error('Error creating payments table:', err);
            } else {
                console.log('Payments table created successfully');
            }
        });

        // Create news table
        db.run(`CREATE TABLE IF NOT EXISTS news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT NOT NULL,
            image TEXT,
            status TEXT DEFAULT 'draft',
            isBreaking BOOLEAN DEFAULT 0,
            isHighlighted BOOLEAN DEFAULT 0,
            date TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating news table:', err);
            } else {
                console.log('News table created successfully');
            }
        });

        console.log('Database initialization complete');
    });
}

// Helper function to run SQL queries with promises
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID });
        });
    });
}

// Helper function to get single row
function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

// Helper function to get multiple rows
function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Students endpoints
app.get('/api/students', async (req, res) => {
    try {
        const students = await dbAll('SELECT * FROM students ORDER BY created_at DESC');
        res.json(students);
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ error: 'Error fetching students' });
    }
});

app.post('/api/students', async (req, res) => {
    try {
        const { name, email, phone, package, start_date, end_date, amount, status } = req.body;
        const result = await dbRun(
            'INSERT INTO students (name, email, phone, package, start_date, end_date, amount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [name, email, phone, package, start_date, end_date, amount, status]
        );
        const newStudent = await dbGet('SELECT * FROM students WHERE id = ?', [result.id]);
        res.status(201).json(newStudent);
    } catch (error) {
        console.error('Error creating student:', error);
        res.status(500).json({ error: 'Error creating student' });
    }
});

app.put('/api/students/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, package, start_date, end_date, amount, status } = req.body;
        await dbRun(
            'UPDATE students SET name = ?, email = ?, phone = ?, package = ?, start_date = ?, end_date = ?, amount = ?, status = ? WHERE id = ?',
            [name, email, phone, package, start_date, end_date, amount, status, id]
        );
        const updatedStudent = await dbGet('SELECT * FROM students WHERE id = ?', [id]);
        res.json(updatedStudent);
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({ error: 'Error updating student' });
    }
});

app.delete('/api/students/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Start a transaction
        await dbRun('BEGIN TRANSACTION');
        
        try {
            // Delete related payments first
            await dbRun('DELETE FROM payments WHERE student_id = ?', [id]);
            
            // Then delete the student
            await dbRun('DELETE FROM students WHERE id = ?', [id]);
            
            // Commit the transaction
            await dbRun('COMMIT');
            
            res.json({ message: 'Student and related payments deleted successfully' });
        } catch (error) {
            // Rollback on error
            await dbRun('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Error deleting student:', error);
        res.status(500).json({ error: 'Error deleting student' });
    }
});

// Payments endpoints
app.get('/api/payments', async (req, res) => {
    try {
        const payments = await dbAll(`
            SELECT p.*, s.name as student_name 
            FROM payments p
            LEFT JOIN students s ON p.student_id = s.id
            ORDER BY p.created_at DESC
        `);
        res.json(payments);
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ error: 'Error fetching payments' });
    }
});

app.post('/api/payments', async (req, res) => {
    try {
        const { student_id, amount, payment_date, payment_method, notes } = req.body;
        const result = await dbRun(
            'INSERT INTO payments (student_id, amount, payment_date, payment_method, notes) VALUES (?, ?, ?, ?, ?)',
            [student_id, amount, payment_date, payment_method, notes]
        );
        const newPayment = await dbGet('SELECT * FROM payments WHERE id = ?', [result.id]);
        res.status(201).json(newPayment);
    } catch (error) {
        console.error('Error creating payment:', error);
        res.status(500).json({ error: 'Error creating payment' });
    }
});

// News endpoints
app.get('/api/news', async (req, res) => {
    try {
        const news = await dbAll('SELECT * FROM news ORDER BY date DESC');
        res.json(news);
    } catch (error) {
        console.error('Error fetching news:', error);
        res.status(500).json({ error: 'Error fetching news' });
    }
});

app.post('/api/news', async (req, res) => {
    try {
        const { title, content, category, image, status, isBreaking, isHighlighted, date } = req.body;
        const result = await dbRun(
            'INSERT INTO news (title, content, category, image, status, isBreaking, isHighlighted, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [title, content, category, image, status, isBreaking, isHighlighted, date]
        );
        const newNews = await dbGet('SELECT * FROM news WHERE id = ?', [result.id]);
        res.status(201).json(newNews);
    } catch (error) {
        console.error('Error creating news:', error);
        res.status(500).json({ error: 'Error creating news' });
    }
});

app.put('/api/news/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, category, image, status, isBreaking, isHighlighted, date } = req.body;
        await dbRun(
            'UPDATE news SET title = ?, content = ?, category = ?, image = ?, status = ?, isBreaking = ?, isHighlighted = ?, date = ? WHERE id = ?',
            [title, content, category, image, status, isBreaking, isHighlighted, date, id]
        );
        const updatedNews = await dbGet('SELECT * FROM news WHERE id = ?', [id]);
        res.json(updatedNews);
    } catch (error) {
        console.error('Error updating news:', error);
        res.status(500).json({ error: 'Error updating news' });
    }
});

app.delete('/api/news/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await dbRun('DELETE FROM news WHERE id = ?', [id]);
        res.json({ message: 'News deleted successfully' });
    } catch (error) {
        console.error('Error deleting news:', error);
        res.status(500).json({ error: 'Error deleting news' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Handle process termination
db.on('open', () => {
    console.log('Database connection is open');
});

db.on('error', (err) => {
    console.error('Database error:', err);
});

process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    db.close(() => {
        console.log('Database connection closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\nShutting down server...');
    db.close(() => {
        console.log('Database connection closed');
        process.exit(0);
    });
});

// Keep the process alive
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // Don't exit the process, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
});
